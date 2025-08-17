import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { googleRouter } from './oauth/googleRoutes';
import { debugRouter } from './debugRoutes';
import { pool } from './db';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Attach database pool to app for Google OAuth
app.set('db', pool);

// Debug startup logging
console.log('REDIRECT_URI =', process.env.GOOGLE_REDIRECT_URI);
console.log('Mounted debug routes at /debug');

// CRITICAL: Mount debug and oauth routes EARLY BEFORE any other routes
app.use('/debug', debugRouter);
app.use(googleRouter);
app.use('/api', googleRouter);

// Add routes introspection endpoint for debugging
app.get('/debug/express-routes', (_req, res) => {
  const routes: Array<{ method: string; path: string }> = [];
  const stack = (app as any)._router?.stack || [];
  stack.forEach((m: any) => {
    if (m.route?.path) {
      routes.push({ method: Object.keys(m.route.methods)[0], path: m.route.path });
    } else if (m.name === 'router' && m.handle?.stack) {
      m.handle.stack.forEach((h: any) => {
        if (h.route?.path) {
          routes.push({ method: Object.keys(h.route.methods)[0], path: h.route.path });
        }
      });
    }
  });
  res.json(routes);
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Global error safety
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED REJECTION:', e);
});

process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT EXCEPTION:', e);
});

(async () => {
  const server = await registerRoutes(app);

  // Global error handler at the end - returns JSON with stack trace  
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const stack = err.stack || 'No stack trace available';

    console.error('API ERROR', err);
    res.status(status).json({ message: err?.message || 'Server error', stack: String(err?.stack || err) });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
