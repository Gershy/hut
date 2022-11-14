# Hut

### What the honk is a Hut?

A Hut partakes in a shared experience. A Hut may define the rules of how an experience plays out, or subscribe to the rules of another Hut. Getting started, it's safe to think of a Hut as a client or server.

### Why use Hut?

- **Architecture Elimination:** Focus 100% on logic that is specific to whatever you're building!
- **Dependency Elimination:** Essentially all required tools are included in Hut, and interoperate seamlessly
- **Client Anosticism:** With minimal configuration any Hut becomes accessible via a client's browser, command-line, desktop app, or other environment
- **Platform Agnosticism:** Hut runs on any supported platform - only some minimal configuration required (platform support is improving with time!)
- **Persistence for free:** Never think about data persistence - simply tell Hut something like: "run my app using storage block A", and your app's state is automatically resumed and persisted!
- **SSL for free:** Hut includes an [acme](https://letsencrypt.org/2019/03/11/acme-protocol-ietf-standard.html) implementation - you'll never have to think about certifying ("padlocking") the domains used for your Huts
- **Observability for free:** Huts have a "subconscious", a stream of data representing decisions being made and resource availability; Hut comes with a built-in "therapist", which is a tool for analyzing this subconscious
- **SEO for free:** You'll never need to touch html (or anything apart from javascript) when building with Hut; behind the scenes Hut renders html for you, handling seo in the process
- **Insights for free:** Minimal configuration enables insight collection on your userbase

### How in sweet heck do I use Hut???

1. Settle down.
2. Clone the Hut repo into, e.g., `/hut`
    ```
    > cd /
    > git clone git@github.com:Gershy/hut.git
    ```
3. Install nodejs (min version 17.0.0)
4. Run:
    ```
    > cd /hut
    > node hut.js test1 "deploy.maturity=dev"
    ```
5. In a browser, navigate to: `http://localhost/html.multi`

This opens a developer tool which simulates multiple users using the "test1" app, which comes included with Hut. By default four users are shown. This is probably the worst webapp ever, but it demonstrates the central aim of Hut: **facilitating shared experiences**. Click the "+" and "-" buttons in any user's view; the state of the counter is synced for all users.

