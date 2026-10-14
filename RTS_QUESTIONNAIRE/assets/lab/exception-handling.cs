using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Sales.Api.Errors;

/// <summary>
/// Q37 — one exception handler for the whole API.
///
/// The rule this file exists to enforce: a client learns what went wrong in a form
/// it can act on, and learns nothing else. No stack trace, no SQL text, no internal
/// hostname, no framework version. The full detail goes to the log with the same
/// trace id the client received, which is what keeps a 500 debuggable without
/// turning the API into a map of its own internals.
///
/// The second rule: known failures are expected outcomes and are mapped, not caught.
/// A domain rule being violated is a 400 or a 409, not an exception that reached a
/// generic handler.
/// </summary>
public sealed class ApiExceptionHandler : IExceptionHandler
{
    private readonly ILogger<ApiExceptionHandler> _logger;
    private readonly IProblemDetailsService _problems;

    public ApiExceptionHandler(ILogger<ApiExceptionHandler> logger, IProblemDetailsService problems)
    {
        _logger = logger;
        _problems = problems;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken cancellationToken)
    {
        var (status, title, type, logLevel) = Classify(exception);

        // The trace id ties the response to the log line and to the trace, and is the
        // only diagnostic detail the client receives.
        var traceId = Activity.Current?.TraceId.ToString() ?? http.TraceIdentifier;

        if (logLevel == LogLevel.Error)
        {
            // Server side only: the full exception, the route and the trace id.
            _logger.LogError(
                exception,
                "unhandled {ExceptionType} on {Method} {Path} (traceId {TraceId})",
                exception.GetType().Name, http.Request.Method, http.Request.Path, traceId);
        }
        else
        {
            // Expected outcomes are logged at Information: a validation failure is not
            // an incident, and logging it as one is how a real incident gets missed in
            // the noise.
            _logger.LogInformation(
                "handled {ExceptionType} on {Path}: {Message} (traceId {TraceId})",
                exception.GetType().Name, http.Request.Path, exception.Message, traceId);
        }

        http.Response.StatusCode = status;

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Type = $"https://docs.example.com/problems/{type}",
            Instance = http.Request.Path,
            Extensions =
            {
                ["traceId"] = traceId,
            },
        };

        // A validation failure is the one case where the client needs the detail, so
        // it is projected field by field. Everything else stays generic.
        if (exception is ValidationException validation)
        {
            problem.Extensions["errors"] = validation.Errors
                .GroupBy(failure => CamelCase(failure.PropertyName))
                .ToDictionary(
                    group => group.Key,
                    group => group.Select(failure => failure.ErrorMessage).ToArray());
        }

        return await _problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    /// <summary>
    /// The mapping. Every entry is a decision about what the caller may learn.
    /// </summary>
    private static (int Status, string Title, string Type, LogLevel Level) Classify(Exception exception) => exception switch
    {
        // Expected: the domain refused the operation. The caller can fix the request.
        DomainValidationException => (
            StatusCodes.Status400BadRequest, "The request violates a business rule.", "business-rule", LogLevel.Information),

        // Also the answer for a resource owned by another tenant. That is a deliberate
        // choice rather than a shortcut: a 403 would confirm that the identifier exists,
        // so a foreign tenant id is reported as not found.
        NotFoundException => (
            StatusCodes.Status404NotFound, "The resource does not exist.", "not-found", LogLevel.Information),

        // Genuine authorisation failures only: the caller is authenticated and is
        // acting within its own tenant, and the operation itself is not permitted.
        ForbiddenException => (
            StatusCodes.Status403Forbidden, "The caller may not perform this operation.", "forbidden", LogLevel.Information),

        ConflictException => (
            StatusCodes.Status409Conflict, "The resource is in a state that does not allow this.", "conflict", LogLevel.Information),

        ConcurrencyConflict => (
            StatusCodes.Status412PreconditionFailed, "The resource changed since it was read.", "stale-precondition", LogLevel.Information),

        OperationCanceledException => (
            499, "The client closed the request.", "client-closed", LogLevel.Information),

        // Unexpected: the caller learns nothing, the log learns everything.
        _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred.", "internal", LogLevel.Error),
    };

    private static string CamelCase(string name) =>
        string.IsNullOrEmpty(name) ? name : char.ToLowerInvariant(name[0]) + name[1..];
}

/// <summary>
/// Validation failures are returned as a validation problem, aggregated, so a client
/// fixes one round of errors instead of discovering them one request at a time.
/// </summary>
public sealed class ValidationMiddleware : IMiddleware
{
    private readonly IValidatorFactory _validators;

    public ValidationMiddleware(IValidatorFactory validators) => _validators = validators;

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        // Only the request body is validated here; query and route parameters are
        // validated by the model binder, and the aggregate validates the rules.
        foreach (var argument in await ReadArgumentsAsync(context))
        {
            var validator = _validators.GetValidator(argument.GetType());
            if (validator is null) continue;

            var result = await validator.ValidateAsync(argument);
            if (result.IsValid) continue;

            // The exception carries every failure, and the handler projects them into
            // the problem details. It is a deliberate control-flow choice: one path out
            // of the pipeline for every rejection, so nothing is forgotten.
            throw new ValidationException(result.Errors);
        }

        await next(context);
    }

    private static async Task<IReadOnlyList<object>> ReadArgumentsAsync(HttpContext context)
    {
        // Implementation omitted: the filter receives the bound arguments from the
        // endpoint metadata in the real project.
        await Task.CompletedTask;
        return Array.Empty<object>();
    }
}

// Domain exception types, declared here so the mapping above reads as one table.
public sealed class DomainValidationException(string message) : Exception(message);
public sealed class NotFoundException(string what) : Exception($"{what} was not found.");
public sealed class ForbiddenException() : Exception("Forbidden.");
public sealed class ConflictException(string message) : Exception(message);
public sealed class ConcurrencyConflict() : Exception("Concurrency conflict.");
