# AI operator: Hermes Agent

ICC is designed AI-first. The UI shows the state of everything and lets people decide; the AI operator does the work. ICC uses [Hermes Agent](https://github.com/NousResearch/hermes-agent) (MIT, by Nous Research) as its AI layer. It has persistent memory, skills, many tools (shell, SSH, browser, Git, Kubernetes, ...), and runs with any LLM provider or a local model.

## What ICC sends to Hermes

| In ICC | Hermes run |
|---|---|
| **Hermes chat** (folders = projects with instructions) | one Hermes session per chat, continued with every message |
| **Planner › Execute with Hermes** | an unattended run for that task. The AI updates the task when finished (done, or waiting with a question) |
| **Alarms › Check & fix** | an unattended run that confirms the alarm, finds the cause, fixes it and verifies |

Each prompt includes who asked, the location of the configuration repository and its conventions (commit with a `Requested-by` trailer, add a changelog line), and the **house rules** from `icc.yaml` (`assistant.instructions`). Unattended runs are queued one at a time. With `ICC_HERMES_AUTO_APPROVE=true` (default) ICC answers Hermes' approval prompts automatically, which means **full access**. Set it to `false` and runs that hit an approval will wait. Approval from the UI is on the roadmap.

## Connect an existing Hermes

1. On the Hermes host, enable the API server in `~/.hermes/.env`:
   ```bash
   API_SERVER_ENABLED=true
   API_SERVER_HOST=0.0.0.0        # only on a trusted network; ICC must reach it
   API_SERVER_KEY=<long random key>
   ```
   Then restart the gateway (`hermes gateway`).
2. Give ICC the URL and the key: `ICC_HERMES_URL=http://hermes-host:8642` and `ICC_HERMES_API_KEY=<key>` (Helm: `ai.url` + `ai.existingSecret`, key `api-key`).
3. Give Hermes write access to the configuration repository (a deploy key or token in Hermes' own environment), so it can commit and push. If Hermes should commit as a recognisable author, set `ICC_AGENT_GIT_EMAIL` to the e-mail it commits with.

Optional: create a Hermes webhook route (deliver-only) for your chat platform and set `ICC_NOTIFY_URL` / `ICC_NOTIFY_SECRET`. ICC then posts "task started / finished" notices there.

## Deploy Hermes with ICC (experimental)

`ai.deploy.enabled=true` in the Helm chart runs the `nousresearch/hermes-agent` image as a StatefulSet next to ICC, with the API server enabled and a generated key shared with ICC. Put your model provider credentials in a Secret and reference it in `ai.deploy.envSecret`, for example:

```bash
kubectl -n icc create secret generic hermes-provider --from-literal=OPENROUTER_API_KEY=sk-or-...
```

Then finish the setup inside the pod (`kubectl -n icc exec -it icc-hermes-0 -- hermes model`). This path is new in 0.1 alpha. Running Hermes on a dedicated VM with SSH access to your servers is the better-tested setup today.
