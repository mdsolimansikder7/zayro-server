const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");
const { requireAdmin } = require("../src/middleware/auth");

test("health endpoint responds without a database connection", async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "zayro-api" });
});

test("unknown API routes return a JSON 404", async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/not-a-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Route not found." });
});

test("protected routes reject requests without a token", async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/cart`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
});

test("admin routes reject requests without a token", async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/admin`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
});

test("admin authorization requires both the configured email and admin role", () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = "owner@example.com";
  try {
    let error;
    requireAdmin({ user: { email: "OWNER@example.com", role: "admin" } }, {}, (nextError) => {
      error = nextError;
    });
    assert.equal(error, undefined);

    requireAdmin({ user: { email: "owner@example.com", role: "customer" } }, {}, (nextError) => {
      error = nextError;
    });
    assert.equal(error.status, 403);

    requireAdmin({ user: { email: "other@example.com", role: "admin" } }, {}, (nextError) => {
      error = nextError;
    });
    assert.equal(error.status, 403);
  } finally {
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
  }
});
