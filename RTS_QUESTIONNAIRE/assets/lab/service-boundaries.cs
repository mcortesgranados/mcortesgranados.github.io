using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Sales.Orders;

/// <summary>
/// Q44 — the inside of one service, and the two boundaries that make it a service
/// rather than a module.
///
/// The first is the data boundary: the orders service is the only writer of the
/// orders schema, and its <see cref="OrdersDbContext"/> is internal to the assembly
/// so no other service can even reference it. The second is the contract boundary:
/// what other services consume is a published interface — a versioned REST or gRPC
/// contract and versioned events — never a shared class library over the wire, which
/// is how two services end up having to be deployed together.
///
/// Hexagonal structure inside the service is the subject of another page; here the
/// point is that a service with clean internal layers and a shared database is still
/// a distributed monolith.
/// </summary>
public sealed class OrderQueryService
{
    // The port rather than the DbContext: the context is internal to the service and
    // cannot appear in a public signature — which is the accessibility compiler rule
    // doing the data-boundary work for free.
    private readonly IOrderReadStore _orders;
    private readonly ICustomerSummaryPort _customers;   // a port, implemented by an adapter over another service
    private readonly IClock _clock;

    public OrderQueryService(IOrderReadStore orders, ICustomerSummaryPort customers, IClock clock)
    {
        _orders = orders;
        _customers = customers;
        _clock = clock;
    }

    /// <summary>
    /// A read that needs data owned by another service. The temptation is a join; the
    /// answer is a port, so the dependency is explicit, bounded by a deadline, and can
    /// be replaced with a local projection when the call becomes the bottleneck.
    /// </summary>
    public async Task<OrderWithCustomer> GetAsync(Guid orderId, CancellationToken cancellationToken)
    {
        // Only orders tables are reachable from here. There is no store for customers,
        // because this service does not own them and cannot see them.
        var order = await _orders.FindWithLinesAsync(orderId, cancellationToken)
            ?? throw new NotFoundException("Order");

        // The customer display name comes through the port. The call carries a deadline
        // and the fallback is a degraded view rather than a failure: the order is the
        // subject of the request, the customer name is decoration.
        var customer = await _customers.TryDescribeAsync(order.CustomerId, cancellationToken);

        return OrderWithCustomer.From(order, customer, _clock.UtcNow);
    }
}

/// <summary>
/// The read port over this service's own data. Public, because the application layer
/// uses it; the implementation is internal, because only this service may touch the
/// orders schema.
/// </summary>
public interface IOrderReadStore
{
    Task<Order?> FindWithLinesAsync(Guid orderId, CancellationToken cancellationToken);
}

/// <summary>
/// The port. It returns a service-specific shape rather than the other service's DTO,
/// which is what keeps their contract from leaking into this one and lets the remote
/// payload change without a recompile here.
/// </summary>
public interface ICustomerSummaryPort
{
    Task<CustomerSummary?> TryDescribeAsync(Guid customerId, CancellationToken cancellationToken);
}

/// <summary>
/// The adapter over the other service. An anti-corruption layer: it translates their
/// model into ours, absorbs their versioning, and is the only file that would change
/// if they replaced gRPC with something else.
/// </summary>
public sealed class CustomerServiceAdapter : ICustomerSummaryPort
{
    private readonly CustomersApi _api;   // generated gRPC client
    private readonly ICacheStore _cache;

    public CustomerServiceAdapter(CustomersApi api, ICacheStore cache)
    {
        _api = api;
        _cache = cache;
    }

    public async Task<CustomerSummary?> TryDescribeAsync(Guid customerId, CancellationToken cancellationToken)
    {
        // A read model of a neighbour's data is legitimate: this service keeps only what
        // it needs for display, and can rebuild it if the neighbour changes.
        var cached = await _cache.GetAsync<CustomerSummary>($"customer-summary:{customerId}");
        if (cached is not null) return cached;

        try
        {
            var response = await _api.DescribeAsync(
                new DescribeRequest { CustomerId = customerId.ToString() },
                deadline: DateTime.UtcNow.AddMilliseconds(300),
                cancellationToken: cancellationToken);

            var summary = CustomerSummary.From(response);
            await _cache.SetAsync($"customer-summary:{customerId}", summary, TimeSpan.FromMinutes(10));
            return summary;
        }
        catch (RpcException failure) when (failure.StatusCode is StatusCode.Unavailable or StatusCode.DeadlineExceeded)
        {
            // Degrade rather than fail: the caller renders the order without the display
            // name. A request for an order should not fail because a neighbour is slow,
            // which is exactly the coupling a synchronous call chain introduces.
            return null;
        }
    }
}

/// <summary>
/// The implementation of the read port. Internal, so the context stays inside the
/// assembly and no other service can reach the orders schema by referencing this one.
/// </summary>
internal sealed class EfOrderReadStore : IOrderReadStore
{
    private readonly OrdersDbContext _context;

    public EfOrderReadStore(OrdersDbContext context) => _context = context;

    public Task<Order?> FindWithLinesAsync(Guid orderId, CancellationToken cancellationToken) =>
        _context.Orders
            .AsNoTracking()
            .Include(item => item.Lines)
            .FirstOrDefaultAsync(item => item.Id == orderId, cancellationToken);
}

/// <summary>
/// The data boundary, declared in code. Internal, sealed, and with no DbSet for
/// anything this service does not own: there is no way to write a cross-service join
/// from here even by accident.
/// </summary>
internal sealed class OrdersDbContext : DbContext
{
    public OrdersDbContext(DbContextOptions<OrdersDbContext> options) : base(options) { }

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<OutboxEntry> Outbox => Set<OutboxEntry>();
}

/// <summary>
/// The boundary enforcement, as a test rather than as a convention.
///
/// `NetArchTest` (or `ArchUnit` / an import-linter contract in the other stacks) is
/// the mechanism that stops the decay: without it, the first urgent ticket produces
/// a reference to another service's assembly and the architecture is gone without
/// anybody deciding to remove it.
/// </summary>
public class ServiceBoundaryTests
{
    private const string OrdersAssembly = "Sales.Orders";
    private const string PlatformAssemblies = "Sales.Platform.*";

    public static IEnumerable<object[]> ForbiddenReferences() => new[]
    {
        new object[] { "Sales.Payments" },
        new object[] { "Sales.Inventory" },
        new object[] { "Sales.Search" },
    };

    [Theory]
    [MemberData(nameof(ForbiddenReferences))]
    public void A_service_does_not_reference_another_service(string otherService)
    {
        // The rule: services communicate over contracts, never over an assembly
        // reference. A reference would let one service's release force another's.
        var result = Types.InAssembly(typeof(OrderQueryService).Assembly)
            .ShouldNot()
            .HaveDependencyOn(otherService)
            .GetResult();

        Assert.True(result.IsSuccessful, $"Orders must not reference {otherService}.");
    }

    [Fact]
    public void Only_the_platform_packages_are_shared()
    {
        var result = Types.InAssembly(typeof(OrderQueryService).Assembly)
            .That().ResideInNamespace("Sales.Orders")
            .ShouldNot()
            .HaveDependencyOn("Sales.DomainModel.Common")
            .GetResult();

        // A shared domain library is the other half of the distributed monolith: it
        // couples deployments through a package instead of through a database.
        Assert.True(result.IsSuccessful, "Domain types are not shared across services.");
    }

    [Fact]
    public void The_db_context_is_not_public()
    {
        var context = typeof(OrdersDbContext);

        Assert.False(context.IsPublic, "The orders context must stay internal to the service.");
    }
}
