using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Sales.Domain.Customers
{
    /// <summary>
    /// Q32 — the repository contract, declared by the layer that needs it.
    ///
    /// Two decisions are encoded in this interface. First, the methods are named for
    /// the question the caller is asking (<c>GetActiveByPlanAsync</c>) rather than for
    /// the mechanism (<c>Query</c>), so the intent survives the refactor. Second,
    /// there is no <c>IQueryable</c> in the public surface and no generic CRUD base:
    /// a generic <c>IRepository&lt;T&gt;</c> exposes Add/Update/Delete for every entity,
    /// which adds a layer and removes the meaning. What varies between queries is
    /// expressed as a specification, not as a leaking expression tree.
    /// </summary>
    public interface ICustomerRepository
    {
        Task<Customer?> FindAsync(CustomerId id, CancellationToken cancellationToken = default);

        Task<Customer?> FindByEmailAsync(EmailAddress email, CancellationToken cancellationToken = default);

        /// <summary>Named for the intent. The caller does not know how it is answered.</summary>
        Task<IReadOnlyList<Customer>> GetActiveByPlanAsync(PlanCode plan, CancellationToken cancellationToken = default);

        /// <summary>Reusable, composable predicates, so the rule lives in one place.</summary>
        Task<IReadOnlyList<Customer>> MatchingAsync(ISpecification<Customer> specification, CancellationToken cancellationToken = default);

        Task<bool> ExistsAsync(ISpecification<Customer> specification, CancellationToken cancellationToken = default);

        void Add(Customer customer);

        // Deliberately absent: SaveAsync, Update, Delete, and any method returning
        // IQueryable. Persisting is the unit of work's job, and removing an aggregate
        // is a domain decision (customer.Close()) that the unit of work then persists.
    }

    /// <summary>
    /// A specification is a predicate with a name. Handlers compose it instead of
    /// duplicating a Where expression, and the implementation can turn it into SQL.
    /// </summary>
    public interface ISpecification<T>
    {
        Expression<Func<T, bool>> ToExpression();
    }

    public sealed class ActiveOnPlan : ISpecification<Customer>
    {
        private readonly PlanCode _plan;
        private readonly DateTimeOffset _asOf;

        public ActiveOnPlan(PlanCode plan, DateTimeOffset asOf)
        {
            _plan = plan;
            _asOf = asOf;
        }

        // Sargable on purpose: it translates to indexed comparisons, not to a scan.
        public Expression<Func<Customer, bool>> ToExpression() =>
            customer => customer.Plan == _plan
                     && customer.Status == CustomerStatus.Active
                     && customer.SubscribedAt <= _asOf
                     && (customer.CancelledAt == null || customer.CancelledAt > _asOf);
    }

    /// <summary>
    /// Composable specifications, so two named rules combine without either one
    /// knowing about the other.
    /// </summary>
    public sealed class AndSpecification<T> : ISpecification<T>
    {
        private readonly ISpecification<T> _left;
        private readonly ISpecification<T> _right;

        public AndSpecification(ISpecification<T> left, ISpecification<T> right)
        {
            _left = left;
            _right = right;
        }

        public Expression<Func<T, bool>> ToExpression()
        {
            var parameter = Expression.Parameter(typeof(T), "entity");
            var body = Expression.AndAlso(
                Expression.Invoke(_left.ToExpression(), parameter),
                Expression.Invoke(_right.ToExpression(), parameter));

            return Expression.Lambda<Func<T, bool>>(body, parameter);
        }
    }
}

namespace Sales.Infrastructure.Persistence
{
    using Sales.Domain.Customers;

    /// <summary>
    /// The implementation. This type is the only place that names EF Core, and it is
    /// the only one that decides how a specification becomes SQL.
    /// </summary>
    public sealed class EfCustomerRepository : ICustomerRepository
    {
        private readonly SalesDbContext _context;

        public EfCustomerRepository(SalesDbContext context) => _context = context;

        public Task<Customer?> FindAsync(CustomerId id, CancellationToken cancellationToken = default) =>
            _context.Customers
                .Include(customer => customer.Addresses)
                .FirstOrDefaultAsync(customer => customer.Id == id, cancellationToken);

        public Task<Customer?> FindByEmailAsync(EmailAddress email, CancellationToken cancellationToken = default) =>
            _context.Customers.FirstOrDefaultAsync(customer => customer.Email == email, cancellationToken);

        public async Task<IReadOnlyList<Customer>> GetActiveByPlanAsync(PlanCode plan, CancellationToken cancellationToken = default) =>
            await _context.Customers
                .AsNoTracking()                                   // read-only: no tracking allocation
                .Where(new ActiveOnPlan(plan, DateTimeOffset.UtcNow).ToExpression())
                .OrderBy(customer => customer.SubscribedAt)
                .ToListAsync(cancellationToken);

        public async Task<IReadOnlyList<Customer>> MatchingAsync(ISpecification<Customer> specification, CancellationToken cancellationToken = default) =>
            await _context.Customers
                .AsNoTracking()
                .Where(specification.ToExpression())
                .ToListAsync(cancellationToken);

        public Task<bool> ExistsAsync(ISpecification<Customer> specification, CancellationToken cancellationToken = default) =>
            _context.Customers.AnyAsync(specification.ToExpression(), cancellationToken);

        public void Add(Customer customer) => _context.Customers.Add(customer);
    }

    /// <summary>
    /// Cross-cutting behaviour goes in a decorator, not inside the repository. The
    /// handler keeps the interface it had, and caching or logging becomes a
    /// registration change instead of an edit to every query.
    /// </summary>
    public sealed class CachingCustomerRepository : ICustomerRepository
    {
        private readonly ICustomerRepository _inner;
        private readonly ICacheStore _cache;

        public CachingCustomerRepository(ICustomerRepository inner, ICacheStore cache)
        {
            _inner = inner;
            _cache = cache;
        }

        public async Task<Customer?> FindAsync(CustomerId id, CancellationToken cancellationToken = default) =>
            await _cache.GetOrCreateAsync($"customer:{id}", () => _inner.FindAsync(id, cancellationToken));

        // Writes are not cached, and neither are specification queries: the second
        // has an unbounded number of shapes to key on, which is how cache poisoning
        // starts.
        public Task<Customer?> FindByEmailAsync(EmailAddress email, CancellationToken cancellationToken = default) =>
            _inner.FindByEmailAsync(email, cancellationToken);

        public Task<IReadOnlyList<Customer>> GetActiveByPlanAsync(PlanCode plan, CancellationToken cancellationToken = default) =>
            _inner.GetActiveByPlanAsync(plan, cancellationToken);

        public Task<IReadOnlyList<Customer>> MatchingAsync(ISpecification<Customer> specification, CancellationToken cancellationToken = default) =>
            _inner.MatchingAsync(specification, cancellationToken);

        public Task<bool> ExistsAsync(ISpecification<Customer> specification, CancellationToken cancellationToken = default) =>
            _inner.ExistsAsync(specification, cancellationToken);

        public void Add(Customer customer) => _inner.Add(customer);
    }
}
