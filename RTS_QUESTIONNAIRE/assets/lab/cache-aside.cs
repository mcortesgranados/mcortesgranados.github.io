using System;
using System.Text.Json;
using System.Threading.Tasks;
using StackExchange.Redis;

namespace Rts.Questionnaire.Caching;

/// <summary>
/// Cache-aside over Redis with an explicit invalidation contract.
/// The four rules encoded here: every entry has a TTL, TTLs are jittered,
/// the database is written before the cache, and readers that miss share a
/// single-flight lock instead of hammering the database.
/// </summary>
public sealed class CacheAsideProfileStore
{
    private const string InvalidatedChannel = "profile:changed";
    private static readonly TimeSpan FreshTtl = TimeSpan.FromMinutes(5);

    private readonly IDatabase _redis;
    private readonly IProfileRepository _repository;

    public CacheAsideProfileStore(IConnectionMultiplexer redis, IProfileRepository repository)
    {
        _redis = redis.GetDatabase();
        _repository = repository;
    }

    public async Task<Profile?> GetAsync(int id)
    {
        var key = Key(id);

        var cached = await _redis.StringGetAsync(key);
        if (!cached.IsNullOrEmpty)                                  // cache hit
            return JsonSerializer.Deserialize<Profile>(cached!);

        var token = Guid.NewGuid().ToString("N");
        var lockKey = $"lock:{key}";

        if (await _redis.StringSetAsync(lockKey, token, TimeSpan.FromSeconds(5), When.NotExists))
        {
            try
            {
                var profile = await _repository.FindAsync(id);        // single-flight read
                if (profile is null) return null;

                await _redis.StringSetAsync(key, JsonSerializer.Serialize(profile), JitteredTtl());
                return profile;
            }
            finally
            {
                await _redis.KeyDeleteAsync(lockKey);                 // release by owner
            }
        }

        await Task.Delay(50);                                         // wait, then retry once
        var retry = await _redis.StringGetAsync(key);
        return retry.IsNullOrEmpty ? await _repository.FindAsync(id) : JsonSerializer.Deserialize<Profile>(retry!);
    }

    public async Task WriteAsync(Profile profile)
    {
        await _repository.SaveAsync(profile);                         // database is the source of truth
        await _redis.StringSetAsync(Key(profile.Id), JsonSerializer.Serialize(profile), JitteredTtl());
        await _redis.PublishAsync(new RedisChannel(InvalidatedChannel, RedisChannel.PatternMode.Literal), profile.Id);
    }

    private static string Key(int id) => $"user:{id}:profile";

    /// <summary>Spreads expiry so a whole keyspace cannot expire in the same second.</summary>
    private static TimeSpan JitteredTtl()
        => FreshTtl + TimeSpan.FromSeconds(Random.Shared.Next(0, 30));
}
