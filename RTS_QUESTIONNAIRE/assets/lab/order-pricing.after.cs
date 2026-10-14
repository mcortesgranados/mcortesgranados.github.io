using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Sales.After;

/// <summary>
/// Q33 — the same behaviour after applying SOLID. Read this against
/// order-pricing.before.cs: the rules are identical, but each one now lives in a
/// class with a single reason to change, the pricing branches became strategies,
/// the god interface became a read port and a write port, and nothing constructs
/// its own dependencies.
///
/// [SRP] This class prices an order. Nothing else. It does not know about tax,
/// storage, email, or the clock.
/// </summary>
public sealed class OrderPricing
{
    private readonly IReadOnlyDictionary<CustomerSegment, IPricingStrategy> _strategies;

    public OrderPricing(IEnumerable<IPricingStrategy> strategies)
    {
        // [OCP] The set of strategies is the wiring, not a branch. A new segment is
        // a new implementation registered in the container; this file is untouched.
        _strategies = strategies.ToDictionary(strategy => strategy.Segment);
    }

    public Money Price(IReadOnlyCollection<OrderLine> lines, CustomerSegment segment)
    {
        if (!_strategies.TryGetValue(segment, out var strategy))
        {
            throw new UnsupportedSegment(segment);
        }

        var subtotal = lines.Aggregate(Money.Zero, (running, line) => running + line.LineTotal);
        return strategy.Apply(subtotal);
    }
}

/// <summary>
/// [OCP] The extension point. New behaviour implements this; it never edits the
/// classes that already exist.
/// </summary>
public interface IPricingStrategy
{
    CustomerSegment Segment { get; }
    Money Apply(Money subtotal);
}

public sealed class GoldPricing : IPricingStrategy
{
    public CustomerSegment Segment => CustomerSegment.Gold;

    public Money Apply(Money subtotal) => subtotal * 0.85m;
}

public sealed class PartnerPricing : IPricingStrategy
{
    public CustomerSegment Segment => CustomerSegment.Partner;

    public Money Apply(Money subtotal) => subtotal * 0.80m;
}

public sealed class EmployeePricing : IPricingStrategy
{
    public CustomerSegment Segment => CustomerSegment.Employee;

    public Money Apply(Money subtotal) => subtotal * 0.50m;
}

/// <summary>[SRP] Tax law changes on its own schedule, so it is its own class.</summary>
public interface ITaxPolicy
{
    Money Apply(Money net, CountryCode country);
}

public sealed class TaxPolicy : ITaxPolicy
{
    private readonly IReadOnlyDictionary<CountryCode, decimal> _rates = new Dictionary<CountryCode, decimal>
    {
        [CountryCode.Colombia] = 0.19m,
        [CountryCode.Spain] = 0.21m,
    };

    private const decimal DefaultRate = 0.07m;

    public Money Apply(Money net, CountryCode country) =>
        net * (_rates.TryGetValue(country, out var rate) ? rate : DefaultRate);
}

// ---------------------------------------------------------------------------
// [ISP] Two ports instead of one god interface. A read-only screen now depends on
// four members instead of fourteen, and cannot even call a write method by mistake.
// ---------------------------------------------------------------------------

public interface IReadRepository<T>
{
    Task<T?> FindAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<T>> ListAsync(int take, int skip, CancellationToken cancellationToken = default);
    Task<int> CountAsync(CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IWriteRepository<T>
{
    void Add(T entity);
    void Remove(T entity);
    Task<int> CommitAsync(CancellationToken cancellationToken = default);
}

// ---------------------------------------------------------------------------
// [LSP] The contract is stated as a test that every implementation runs, and no
// implementation is allowed to throw from a member it declared.
// ---------------------------------------------------------------------------

/// <summary>
/// <c>RepositoryContractTests&lt;T&gt;</c> in the test project runs FindAsync,
/// ListAsync, CountAsync and ExistsAsync against every implementation — the EF Core
/// one, the Dapper one and the in-memory one. A subtype that cannot honour the
/// contract does not compile, because the contract no longer declares methods it
/// cannot support.
/// </summary>
public interface IRepositoryContract<TRepository, TEntity>
{
    TRepository CreateRepository();
}

// ---------------------------------------------------------------------------
// [DIP] The use case depends on abstractions it declares, and the composition root
// is the only place that names a concrete type.
// ---------------------------------------------------------------------------

public sealed class ConfirmOrderHandler
{
    private readonly IReadRepository<Order> _orders;      // not SqlOrderRepository
    private readonly IWriteRepository<Order> _writer;     // not SalesDbContext
    private readonly OrderPricing _pricing;
    private readonly ITaxPolicy _tax;                     // not a country switch
    private readonly INotifier _notifier;                 // not SmtpClient
    private readonly IClock _clock;                       // not DateTime.UtcNow

    public ConfirmOrderHandler(
        IReadRepository<Order> orders,
        IWriteRepository<Order> writer,
        OrderPricing pricing,
        ITaxPolicy tax,
        INotifier notifier,
        IClock clock)
    {
        _orders = orders;
        _writer = writer;
        _pricing = pricing;
        _tax = tax;
        _notifier = notifier;
        _clock = clock;
    }

    public async Task<Result> HandleAsync(ConfirmOrder command, CancellationToken cancellationToken = default)
    {
        var order = await _orders.FindAsync(command.OrderId, cancellationToken);
        if (order is null) return Result.NotFound(command.OrderId);
        if (order.CustomerId != command.CustomerId) return Result.Forbidden();

        // Each collaborator answers one question. No branch about tax law or
        // customer segments appears in this method.
        var net = _pricing.Price(order.Lines, command.Segment);
        var gross = _tax.Apply(net, command.Country);

        order.Confirm(gross, _clock.UtcNow);
        _writer.Add(order);
        await _writer.CommitAsync(cancellationToken);

        // Failure to notify no longer rolls back a confirmed order: the decision
        // and the side effect are separate concerns with separate error handling.
        await _notifier.OrderConfirmedAsync(order.CustomerId, gross, cancellationToken);

        return Result.Ok(gross);
    }
}

/// <summary>
/// The composition root. This is the only file in the solution that names a
/// concrete implementation, which is what makes the domain testable without a
/// database and the deployment target swappable.
/// </summary>
public static class CompositionRoot
{
    public static IServiceCollection AddSales(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IReadRepository<Order>, EfOrderRepository>();
        services.AddScoped<IWriteRepository<Order>, EfOrderRepository>();
        services.AddScoped<IPricingStrategy, GoldPricing>();
        services.AddScoped<IPricingStrategy, PartnerPricing>();
        services.AddScoped<IPricingStrategy, EmployeePricing>();
        services.AddScoped<OrderPricing>();
        services.AddScoped<ITaxPolicy, TaxPolicy>();
        services.AddScoped<INotifier, SendGridNotifier>();
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<ConfirmOrderHandler>();

        return services;
    }
}
