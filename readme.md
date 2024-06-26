# Hut

### What the *honk* is a Hut?

A Hut partakes in a shared experience. A Hut may define the rules of how an experience plays out, or subscribe to the rules of another Hut. It's pretty safe to think of a Hut as a client or server.

### Why use Hut?

- **Architecture Elimination:** Focus 100% on logic that is specific to what you're building!
- **Dependency Elimination:** Essentially all required tools are included in Hut, and they interoperate with awareness of each other
- **Client Agnosticism:** With minimal configuration any Hut becomes accessible via a client's browser, command-line, desktop app, or other environment
- **Platform Agnosticism:** Hut runs on any supported platform - only some minimal configuration required (platform support is improving with time!)
- **Persistence for free:** Never think about data persistence - simply tell Hut something like: "run my app using storage block A", and your app's state is automatically resumed and persisted!
- **SSL for free:** Hut includes an [acme](https://letsencrypt.org/2019/03/11/acme-protocol-ietf-standard.html) implementation - you'll never have to think about certifying ("padlocking") the domains used with Hut
- **Observability for free:** All Huts have a Subconscious: a stream of data representing decisions being made, resource availability, and metrics. Analyze Huts with Therapists: tools which allow full observation of a Subconscious
- **User Analytics for free:** A component of Subconscious + Therapy; minimal configuration enables full insight on your userbase

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

You are now using a developer tool which simulates multiple users using
the "test1" app (to view the "test1" app normally simply navigate in a
separate tab to `http://localhost`). By default four users are shown.
Click the "+" and "-" buttons in any user's view - you'll see the state
of the counter is synced for all users!

This is probably the worst webapp ever, but it demonstrates the central aim of Hut: **facilitating shared experiences!**

This example involved a very minor amount of configuration, and ran [out-of-the-box source code](room/internal/test1/test1.js). The following examples will iteratively increase our understanding of both configuration, and the code that forms a Hut.

*This readme is not complete yet!*
