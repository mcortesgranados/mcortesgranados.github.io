using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sales.Application.Orders.ConfirmOrder;
using Sales.Domain.Orders;

namespace Sales.Infrastructure.Persistence;

/// <summary>
/// Infrastructure layer. This is the only project that names EF Core, the only
/// one that maps the domain to a schema, and the only one that decides which
/// implementation of each port the application receives.
/// </summary>
public sealed class EfOrderRepository : IOrderRepository
{
    private readonly SalesDbContext _context;

    public EfOrderRepository(SalesDbContext context) => _context = context;

    public async Task<Order?> FindAsync(Guid id, CancellationToken cancellationToken = default)
        => await _context.Orders
            .Include(order => order.Lines)              // aggregate loaded as a whole
            .FirstOrDefaultAsync(order => order.Id == id, cancellationToken);
}

public sealed class SalesDbContext : DbContext, IUnitOfWork
{
    public SalesDbContext(DbContextOptions<SalesDbContext> options) : base(options) { }

    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.Entity<Order>(entity =>
        {
            entity.HasKey(order => order.Id);
            entity.OwnsMany(order => order.Lines, lines => lines.WithOwner().HasForeignKey("OrderId"));
            entity.Property(order => order.Status).HasConversion<string>().HasMaxLength(20);
            entity.Ignore(order => order.Events);      // domain events are not a table
        });
    }
}

/// <summary>Adapter for the domain clock, so tests can control time.</summary>
public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}

/// <summary>
/// Composition root: the single place that binds ports to implementations.
/// The API project calls this and knows nothing about EF Core either.
/// </summary>
public static class InfrastructureRegistration
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<SalesDbContext>(options => options.UseSqlServer(connectionString));
        services.AddScoped<IUnitOfWork>(provider => provider.GetRequiredService<SalesDbContext>());
        services.AddScoped<IOrderRepository, EfOrderRepository>();
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<ConfirmOrderHandler>();

        return services;
    }
}
