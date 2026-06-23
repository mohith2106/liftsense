export function renderErrorPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Something went wrong</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, sans-serif;
        background: #0b0d12;
        color: #f4f4f5;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
      }
      .card {
        text-align: center;
        max-width: 420px;
        padding: 2rem;
      }
      h1 {
        font-size: 1.25rem;
        margin-bottom: 0.5rem;
      }
      p {
        color: #a1a1aa;
        font-size: 0.875rem;
      }
      a {
        display: inline-block;
        margin-top: 1.5rem;
        padding: 0.5rem 1rem;
        background: #f4f4f5;
        color: #0b0d12;
        border-radius: 0.375rem;
        text-decoration: none;
        font-size: 0.875rem;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Something went wrong on the server</h1>
      <p>Please try refreshing the page or come back later.</p>
      <a href="/">Go home</a>
    </div>
  </body>
</html>`;
}
