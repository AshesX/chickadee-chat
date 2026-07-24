# Setting up your own signaling server

This is a step-by-step guide for **Chickadee Chat users**, not developers — you don't need to
know how to code or use Git to follow it.

## What is the signaling server, and why run your own?

Chickadee Chat's voice, video, and screen share always travel directly between you and your
friends (peer-to-peer) — no server ever sees or touches that media. The **signaling server**'s
only job is the initial introduction: it tells peers "here's how to find each other," then gets
out of the way. By default, the app uses a signaling server shared by everyone who hasn't
configured their own.

Reasons to run your own instead:

- **You don't want to depend on someone else's server.** If the shared default server ever goes
  down or is retired, your Spaces stop working until you point them elsewhere.
- **You can lock it down.** A private server can require a shared password (a "join secret") so
  only people you've told can connect — the default public server has no such gate.
- **It's free**, at least to start (see the note on Render's free tier below).

You'll end up with two pieces of information: a **server address** (something like
`wss://my-server.onrender.com`) and, optionally, a **join secret** (a password you make up).
Both get typed into the app — no files to edit unless you choose the advanced route later in
this guide.

## Option A: Free hosting on Render.com (recommended)

[Render](https://render.com) is a cloud hosting service with a free tier and a web dashboard —
this is also what powers Chickadee Chat's own default server, so it's a well-trodden path.

### Step 1 — Create a Render account

Go to [render.com](https://render.com) and sign up (GitHub or email both work — you do **not**
need to fork or otherwise touch the Chickadee Chat code on GitHub for this).

### Step 2 — Start a new Web Service

From the Render Dashboard, click **New +** → **Web Service**.

You'll be asked to connect a repository. Look for an option along the lines of **Public Git
Repository** (Render's own wording is "deploy a public repository you don't belong to" — exactly
our case). Paste in:

```
https://github.com/AshesX/chickadee-chat
```

and continue.

### Step 3 — Configure the build

Render will show a configuration form. Fill it in like this:

| Field | Value |
|---|---|
| **Name** | anything you like, e.g. `my-chickadee-signaling` |
| **Region** | whichever is closest to you or your friends |
| **Branch** | `main` |
| **Root Directory** | leave **blank** |
| **Language / Runtime** | **Docker** |
| **Dockerfile Path** | `apps/signaling/Dockerfile` |
| **Instance Type** | **Free** (to start — see the note below) |

Don't add a `PORT` environment variable — Render sets that automatically and the server already
reads it.

### Step 4 — (Recommended) lock your server with a password

Still on the configuration page, find the **Environment Variables** section and add:

| Key | Value |
|---|---|
| `CHICKADEE_JOIN_SECRET` | any password you make up, e.g. `friends-only-2026` |

Without this, anyone who somehow learns your server's address and a Space's invite code could
join — an unlikely but real exposure. Setting this closes it: the app will refuse anyone who
doesn't also supply the matching secret.

### Step 5 — Deploy and grab your server address

Click **Create Web Service** (or **Deploy Web Service**). Render builds and starts the server —
the first build takes a few minutes; watch the **Logs** tab for:

```
Chickadee signaling server listening on :10000
```

(the port number itself doesn't matter — Render handles that). Once it's up, copy the URL shown
at the top of the service page. It'll look like:

```
https://my-chickadee-signaling.onrender.com
```

**Change `https://` to `wss://`** — that's the address the app needs:

```
wss://my-chickadee-signaling.onrender.com
```

### A note on Render's free tier

Render's free instances **spin down after 15 minutes with no traffic** and take about a minute
to wake back up on the next connection. In practice: if nobody's used your server in a while, the
first friend to join a call will see a delay of up to a minute before it connects. If that's
annoying, upgrading the service to Render's cheapest paid instance type removes the spin-down
entirely (check Render's current pricing — it changes over time).

## Connecting the app to your server

You have two ways to do this. **Use the first one** unless you specifically want your server to
be the app's default for every Space.

### The easy way — a custom server for one Space

This needs no files, and is what most people want: your own Space uses your own server, while
everything else about the app is unchanged.

1. Open the sidebar's space switcher (click the hamburger icon next to your Space name, or use
   **Create Space** / **Join Space** from the first-run welcome screen).
2. Click **Create Space** (or **Join Space** if a friend already set one up — see below).
3. Expand **Show Advanced Connection Settings**.
4. Paste your `wss://…` address into **Signaling Server URL**.
5. If you set a join secret in Step 4 above, paste the same value into **Join Secret / Password**.
6. Finish creating the Space as normal.

You can change these later too: open **Space Settings** for that Space (gear icon in the Space's
action row) — the same two fields are there.

### The global way — make it the app's default everywhere

If you'd rather every Space use your server unless told otherwise, set an environment variable
where the app runs, or drop a `.env` file **next to the app's `.exe`** (the portable build also
checks parent folders):

```env
CHICKADEE_SIGNALING_URL=wss://my-chickadee-signaling.onrender.com
CHICKADEE_JOIN_SECRET=friends-only-2026
```

`CHICKADEE_JOIN_SECRET` here must be set on **both** the server (Step 4) and every client's
`.env`/environment for the same reason as above.

## Inviting friends to your private server

A Space's invite code on its own is **not enough** if it's using a custom server — an invite
code only identifies the Space, not where to find it. Share **all** of the following with
whoever you want to invite:

1. The **invite code** (copy it from the Space's action row).
2. Your **signaling server address** (`wss://…`).
3. Your **join secret**, if you set one.

Each friend enters all three when they use **Join Space**: invite code in the main field, the
other two under **Show Advanced Connection Settings**.

## Option B: Run it yourself with Docker (advanced)

If you'd rather host on your own always-on PC or home server instead of a cloud provider, and
you're already comfortable with a terminal:

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Download the Chickadee Chat source as a ZIP from GitHub (green **Code** button → **Download
   ZIP** — no Git required) and extract it.
3. Open a terminal in the extracted folder and run:

   ```bash
   docker build -f apps/signaling/Dockerfile -t chickadee-signaling .
   docker run -d -p 8080:8080 --name chickadee-signaling ^
     -e CHICKADEE_JOIN_SECRET=friends-only-2026 chickadee-signaling
   ```

   (drop the `-e CHICKADEE_JOIN_SECRET=…` line if you don't want a password.)

4. On the same machine or your local network, the server address is `ws://<this-PC's-LAN-IP>:8080`.
5. For friends outside your network to reach it, you'd need to either forward port 8080 on your
   router to this PC, or use a tunneling service (e.g. Cloudflare Tunnel, ngrok) — both are
   beyond the scope of this guide, and a cloud host (Option A) sidesteps them entirely.

## Troubleshooting

- **"Couldn't reach the signaling server"** — double-check you used `wss://` (not `https://`),
  that the address has no typos, and — on Render's free tier — that you've waited about a minute
  if the server had been idle.
- **A friend can't join even with the right invite code** — did they also enter your custom
  server address (and join secret, if any) under Advanced Connection Settings? The invite code
  alone isn't enough for a non-default server.
- **Signaling connects but voice/video never does** — that's a separate, rarer issue: WebRTC
  itself failing to establish a peer-to-peer path, usually when both sides are behind strict
  ("symmetric") NATs. See "Play over the internet" in the main [README](../README.md) for
  running your own TURN relay to cover that case.

## Security notes

Your signaling server is **open by default** — anyone who knows a Space's invite code can join
it, since invite codes are generated locally and aren't secret. `CHICKADEE_JOIN_SECRET` (Step 4)
is the fix. The server also validates and rate-limits everything it receives, and moderation
actions (kicks, bans, locks) are enforced server-side — but none of this amounts to end-to-end
authentication. Treat a server you've shared widely accordingly.
