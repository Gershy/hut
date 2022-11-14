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
2. Open up a terminal!
3. Clone the Hut repo into, e.g., `/hut`:
    ```
    > cd /
    > git clone git@github.com:Gershy/hut.git
    ```
4. Install nodejs (min version 17.0.0 - [I recommend you use nvm!](https://heynode.com/tutorial/install-nodejs-locally-nvm/))
5. Run:
    ```
    > cd /hut
    > node hut.js test1 "deploy.maturity=dev"
    ```
6. In a browser, navigate to: `http://localhost/html.multi`

<!-- `````` -->

*This is a minimal example to get started with Hut!*

You are now using a developer tool which simulates multiple users using the "test1" app.
(To view the "test1" app as a single user simply navigate in a separate tab to `http://localhost`!)
By default four users are shown. Click the "+" and "-" buttons in any user's view - the state of the counter is synced for all users!

This is probably the worst webapp ever, but it demonstrates the central aim of Hut: **facilitating shared experiences!**

This example involved a very minor amount of configuration, and ran [an out-of-the-box Hut](room/test1/test1.js). The following examples will iteratively increase our understanding of both configuration, and the code that forms a Hut.
