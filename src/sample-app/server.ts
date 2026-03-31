import { createServer } from "node:http";

const port = Number(process.argv[2] ?? process.env.PORT ?? 3210);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sample Agent App</title>
    <style>
      body { font-family: sans-serif; padding: 24px; }
      #dashboard { margin-top: 16px; font-weight: bold; }
    </style>
  </head>
  <body>
    <h1>Sample Agent App</h1>
    <button id="login-button" type="button">Login</button>
    <button id="delayed-login-button" type="button">Delayed Login</button>
    <div id="dashboard">Logged out</div>
    <script>
      const button = document.getElementById("login-button");
      const delayedButton = document.getElementById("delayed-login-button");
      const dashboard = document.getElementById("dashboard");
      button.addEventListener("click", () => {
        dashboard.textContent = "Dashboard";
      });
      delayedButton.addEventListener("click", () => {
        setTimeout(() => {
          dashboard.textContent = "Dashboard";
        }, 1200);
      });
    </script>
  </body>
</html>`;

const server = createServer((_, response) => {
  response.statusCode = 200;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Sample app listening on http://127.0.0.1:${port}`);
});
