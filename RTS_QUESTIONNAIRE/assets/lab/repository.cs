using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using Microsoft.EntityFrameworkCore;

namespace Rts.Questionnaire.DataAccess;

/// <summary>
/// EF Core for the domain and transactional writes, Dapper for reporting-shaped
/// reads. Both sit behind the same interface, so the persistence choice stays an
/// implementation detail and every query stays testable.
/// </summary>
public interface IOrderRepository
{
    Task<Order?> FindAsync(int orderId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OrderReport>> GetReportAsync(int customerId, CancellationToken cancellationToken = default);
    Task AddAsync(Order order, CancellationToken cancellationToken = default);
}

public sealed class OrderRepository : IOrderRepository
{
    private readonly AppDbContext _context;
    private readonly IUnitOfWork _unitOfWork;

    public OrderRepository(AppDbContext context, IUnitOfWork unitOfWork)
    {
        _context = context;
        _unitOfWork = unitOfWork;
    }

    /// <summary>Tracked read: the entity will be updated inside a Unit of Work.</summary>
    public Task<Order?> FindAsync(int orderId, CancellationToken cancellationToken = default)
        => _context.Orders
            .Include(order => order.Lines)
            .AsSplitQuery()                                        // avoids a cartesian explosion
            .FirstOrDefaultAsync(order => order.Id == orderId, cancellationToken);

    /// <summary>Reporting read: no tracking, projection straight to a DTO, exact SQL.</summary>
    public async Task<IReadOnlyList<OrderReport>> GetReportAsync(int customerId, CancellationToken cancellationToken = default)
    {
        const string sql = """
            SELECT o.Id, o.CreatedAt, o.Total, c.Name AS CustomerName, COUNT(l.Id) AS Lines
            FROM Orders o
            JOIN Customers c ON c.Id = o.CustomerId
            LEFT JOIN OrderLines l ON l.OrderId = o.Id
            WHERE o.CustomerId = @customerId
            GROUP BY o.Id, o.CreatedAt, o.Total, c.Name
            ORDER BY o.CreatedAt DESC;
            """;

        var connection = _context.Database.GetDbConnection();
        var rows = await connection.QueryAsync<OrderReport>(
            new CommandDefinition(sql, new { customerId }, cancellationToken: cancellationToken));

        return rows.AsList();
    }

    public async Task AddAsync(Order order, CancellationToken cancellationToken = default)
    {
        await _context.Orders.AddAsync(order, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);    // one transaction per business operation
    }
}

public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
