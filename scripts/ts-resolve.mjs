// Lets the test scripts import the app's TypeScript directly: the app writes `from "./today"`, Node wants
// `./today.ts`. Usage: node --import ./scripts/ts-resolve.mjs scripts/test-insights.mjs
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (e) {
      if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return next(specifier + ".ts", context);
      throw e;
    }
  },
});
