using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Net.Mail;
using System.Threading.Tasks;

namespace Sales.Before;

/// <summary>
/// Q33 — the design that violates SOLID, kept here because the violations are the
/// argument. Every principle is broken on purpose and each violation is marked, so
/// the refactored version in order-pricing.after.cs can be read as a diff against
/// this file rather than as a claim.
///
/// This is a realistic shape, not a straw man: it starts as one cohesive service
/// and grows for two years, one small addition at a time, each one reasonable on
/// its own.
/// </summary>
public sealed class OrderService
{
    private readonly string _connectionString;

    // [DIP] The connection string is a configuration detail that reached the
    // business class, and the connection is created here rather than injected.
    public OrderService(string connectionString) => _connectionString = connectionString;

    /// <summary>
    /// [SRP] Five reasons to change in one method: pricing rules, tax law,
    /// persistence, notification and logging. A change to any of the five means
    /// editing this file, and the five reviews are done by different people.
    /// [OCP] New behaviour is a new branch: every new customer segment edits this
    /// method, so it is never closed for modification.
    /// </summary>
    public async Task<decimal> ConfirmAsync(Guid orderId, Customer customer, List<Line> lines)
    {
        // --- pricing -------------------------------------------------------
        decimal total = 0;
        foreach (var line in lines)
        {
            total += line.Quantity * line.UnitPrice;
        }

        if (customer.Type == "Gold")
        {
            total *= 0.85m;
        }
        else if (customer.Type == "Partner")
        {
            total *= 0.80m;
        }
        else if (customer.Type == "Employee")
        {
            total *= 0.50m;
        }
        // [OCP] The next segment is another else-if here. The method's cyclomatic
        // complexity is now 12 and the branch set is the only documentation of the
        // rule.

        // --- tax -----------------------------------------------------------
        if (customer.Country == "CO")
        {
            total *= 1.19m;
        }
        else if (customer.Country == "ES")
        {
            total *= 1.21m;
        }
        else
        {
            total *= 1.07m;
        }

        // --- persistence ---------------------------------------------------
        // [DIP] The domain decides which database it uses, and it decides it here.
        using (var connection = new SqlConnection(_connectionString))
        {
            await connection.OpenAsync();
            using var command = connection.CreateCommand();
            command.CommandText = "UPDATE Orders SET Total = @total, Status = 'Confirmed' WHERE Id = @id";
            command.Parameters.AddWithValue("@total", total);
            command.Parameters.AddWithValue("@id", orderId);
            await command.ExecuteNonQueryAsync();
        }

        // --- notification --------------------------------------------------
        // [SRP] A failure here throws out of a method that already committed, and
        // the caller cannot tell whether the order was confirmed.
        using (var client = new SmtpClient("smtp.internal"))
        {
            await client.SendMailAsync(new MailMessage(
                "sales@example.com", customer.Email, "Order confirmed", $"Total {total:C}"));
        }

        // --- logging -------------------------------------------------------
        Console.WriteLine($"[{DateTime.UtcNow:O}] order {orderId} confirmed for {customer.Email}");

        return total;
    }
}

/// <summary>
/// [ISP] The god interface. Every consumer depends on all fourteen members, so a
/// read-only screen carries write methods it must never call, and every test double
/// has to implement methods that will never be invoked.
/// </summary>
public interface IRepository<T>
{
    Task<T> GetByIdAsync(Guid id);
    Task<IReadOnlyList<T>> GetAllAsync();
    Task<IReadOnlyList<T>> FindAsync(string predicate);
    Task<int> CountAsync();

    Task AddAsync(T entity);
    Task UpdateAsync(T entity);
    Task DeleteAsync(Guid id);

    Task SaveChangesAsync();
    Task BeginTransactionAsync();
    Task CommitAsync();
    Task RollbackAsync();

    Task RebuildCacheAsync();
    Task ArchiveAsync(Guid id);
    Task ExportCsvAsync(string path);
}

/// <summary>
/// [LSP] A subtype that cannot honour the contract it inherited. The compiler is
/// satisfied; every caller now has to know which implementation it holds, and the
/// method that throws is reachable from code that has no way to expect it.
/// </summary>
public sealed class ReadOnlyReportingRepository : IRepository<Order>
{
    public Task<Order> GetByIdAsync(Guid id) => throw new NotImplementedException();

    public Task<IReadOnlyList<Order>> GetAllAsync() => throw new NotImplementedException();

    public Task<IReadOnlyList<Order>> FindAsync(string predicate) => throw new NotImplementedException();

    public Task<int> CountAsync() => throw new NotImplementedException();

    public Task AddAsync(Order entity) => throw new NotImplementedException();
    public Task UpdateAsync(Order entity) => throw new NotImplementedException();
    public Task DeleteAsync(Guid id) => throw new NotImplementedException();
    public Task SaveChangesAsync() => throw new NotImplementedException();
    public Task BeginTransactionAsync() => throw new NotImplementedException();
    public Task CommitAsync() => throw new NotImplementedException();
    public Task RollbackAsync() => throw new NotImplementedException();
    public Task RebuildCacheAsync() => throw new NotImplementedException();

    // The giveaway: the contract says Archive, the implementation says never.
    public Task ArchiveAsync(Guid id) =>
        throw new NotSupportedException("This repository is read-only. Use IWriteRepository instead.");

    public Task ExportCsvAsync(string path) => throw new NotImplementedException();
}
