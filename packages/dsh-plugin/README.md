# dsh-plugin-weekly-resume

Connect Weekly Resume to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Read, create, and edit your resumes and job applications from a Harness session.

## Install

```bash
dsh plugin --profile <name> add dsh-plugin-weekly-resume
```

This package declares `dsh.bundle`, so the profile picks it up as a layer and mounts it automatically. Until you configure a key it mounts nothing and logs a warning, so installing it never leaves a profile unbootable.

## Configure

Mint an API key in your Weekly Resume dashboard under Settings → API keys and export it as `WEEKLY_RESUME_API_KEY` — the bundle patch reads that variable. To set it explicitly, or to change any other option, patch the row by id from your profile's `cordis.patch.yml`:

```yaml
- id: weekly-resume
  config:
    apiKey: !!js process.env.WEEKLY_RESUME_API_KEY
```

### Options

| Key | Default | Description |
|---|---|---|
| `apiKey` | `''` | API key from `<url>/dashboard/settings/api-keys`. Empty mounts nothing. |
| `url` | - | Origin of your instance. Set this if you self-host. |
| `serverName` | `resume` | Tool namespace. Tools reach the model as `mcp__<serverName>__<rawName>`. |
| `toolCallTimeoutMs` | `60000` | Per-tool-call timeout. |

Every tool Weekly Resume publishes is exposed. Narrowing that set is not currently possible from a plugin: Harness's `ctx.tools.restrict()` requires an agent-scoped context, which a plugin context is not.

### Self-hosted

```yaml
- id: weekly-resume
  config:
    apiKey: !!js process.env.WEEKLY_RESUME_API_KEY
    url: http://localhost:3000
```

## What it does

Bridges the Weekly Resume MCP server into `ctx.tools`, and contributes a system-prompt section covering the things models get wrong about resume editing: reading before patching, RFC 6902 path construction against the published schema, UUID-keyed section entries, and locked resumes.

You could wire the bridge yourself with a raw `@deepseek-ai/dsh-mcp-client` row. What you cannot do that way is contribute the prompt section — that is what this package adds.

## Development

This package lives in the Weekly Resume monorepo at `packages/dsh-plugin`, next to `packages/mcp` — the server it bridges. `src/tool-names.test.ts` checks every tool the prompt guide names against `@reactive-resume/mcp/tool-names`, so renaming a tool breaks this package in the same pull request.

```bash
pnpm --filter dsh-plugin-weekly-resume test
pnpm --filter dsh-plugin-weekly-resume build
```

## License

MIT
