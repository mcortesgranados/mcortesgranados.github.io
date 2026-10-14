using System;
using Autofac;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Rts.Questionnaire.Composition;

/// <summary>
/// Composition root: registrations live here, every lifetime is explicit, and the
/// graph is validated at start-up so a captive dependency never reaches production.
/// </summary>
public static class ServiceRegistration
{
    public static IServiceCollection AddOrderModule(this IServiceCollection services, OrderModuleOptions options)
    {
        // Stateless infrastructure: one instance for the whole application.
        services.AddSingleton<TimeProvider>(TimeProvider.System);
        services.AddSingleton(options);

        // Per-request state: one instance per scope, and never captured by a singleton.
        services.AddScoped<IOrderContext, OrderContext>();
        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Interface binding: callers depend on the abstraction, not on the class.
        services.AddScoped<IOrderService, OrderService>();

        // Cross-cutting behaviour is a decorator, not code inside OrderService (Scrutor).
        services.Decorate<IOrderService, CachedOrderService>();

        // Runtime parameters travel through a factory delegate, not through the container.
        services.AddTransient<Func<string, IExporter>>(provider => key => key switch
        {
            "csv" => provider.GetRequiredService<CsvExporter>(),
            _ => provider.GetRequiredService<PdfExporter>()
        });

        return services;
    }

    /// <summary>An invalid graph fails at start-up instead of in production.</summary>
    public static ServiceProvider BuildValidated(this IServiceCollection services)
        => services.BuildServiceProvider(new ServiceProviderOptions
        {
            ValidateOnBuild = true,
            ValidateScopes = true
        });
}

/// <summary>
/// The same graph expressed as an Autofac module, which is how older enterprise
/// codebases group their registrations and how assembly scanning is applied.
/// </summary>
public sealed class OrderModule : Module
{
    protected override void Load(ContainerBuilder builder)
    {
        builder.RegisterType<OrderRepository>().As<IOrderRepository>().InstancePerLifetimeScope();
        builder.RegisterType<OrderService>().As<IOrderService>().InstancePerLifetimeScope();
        builder.RegisterDecorator<CachedOrderService, IOrderService>();

        builder.RegisterAssemblyTypes(typeof(OrderModule).Assembly)
            .Where(type => type.Name.EndsWith("Validator", StringComparison.Ordinal))
            .AsImplementedInterfaces()
            .InstancePerDependency();
    }
}
