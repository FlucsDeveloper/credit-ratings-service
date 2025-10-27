#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";

/**
 * Doctor script to verify environment setup for v4 system.
 * Checks:
 * - Environment variables
 * - Required dependencies
 * - Database migration status
 * - Core modules exist
 */

type Check = {
  name: string;
  passed: boolean;
  message: string;
};

const checks: Check[] = [];

function check(name: string, passed: boolean, message: string) {
  checks.push({ name, passed, message });
  const icon = passed ? "✓" : "✗";
  console.log(`${icon} ${name}: ${message}`);
}

// 1. Check environment variables
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL_ID = process.env.DEEPSEEK_MODEL_ID;
const INSTITUTIONAL_MODE = process.env.INSTITUTIONAL_MODE;

check(
  "DEEPSEEK_API_KEY",
  !!DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.startsWith("sk-"),
  DEEPSEEK_API_KEY ? "Present" : "Missing"
);

check(
  "DEEPSEEK_MODEL_ID",
  !!DEEPSEEK_MODEL_ID,
  DEEPSEEK_MODEL_ID || "Not set (should be deepseek-chat)"
);

check(
  "INSTITUTIONAL_MODE",
  INSTITUTIONAL_MODE === "true",
  INSTITUTIONAL_MODE || "Not set"
);

// 2. Check Prisma database
const dbPath = path.join(process.cwd(), "prisma", "dev.db");
check(
  "Database exists",
  fs.existsSync(dbPath),
  fs.existsSync(dbPath) ? "prisma/dev.db found" : "Database not created"
);

// 3. Check Prisma client generated
const prismaClientPath = path.join(
  process.cwd(),
  "node_modules",
  "@prisma",
  "client"
);
check(
  "Prisma Client",
  fs.existsSync(prismaClientPath),
  fs.existsSync(prismaClientPath) ? "Generated" : "Not generated"
);

// 4. Check core modules exist
const coreModules = [
  "lib/ai/training-sdk.ts",
  "lib/crawler/source-graph.ts",
  "lib/validator/quality-loop.ts",
  "app/api/ratings-v4/route.ts",
  "prisma/schema.prisma",
];

for (const modulePath of coreModules) {
  const fullPath = path.join(process.cwd(), modulePath);
  check(
    `Module: ${modulePath}`,
    fs.existsSync(fullPath),
    fs.existsSync(fullPath) ? "Exists" : "Missing"
  );
}

// 5. Check v3 modules (needed by v4)
const v3Modules = [
  "lib/scraper/fetch-v3.ts",
  "lib/scraper/headless-fetch-v3.ts",
  "lib/ai/deepseek-extractor-v3.ts",
];

for (const modulePath of v3Modules) {
  const fullPath = path.join(process.cwd(), modulePath);
  check(
    `V3 Module: ${modulePath}`,
    fs.existsSync(fullPath),
    fs.existsSync(fullPath) ? "Exists" : "Missing"
  );
}

// 6. Check Playwright installation
try {
  const { chromium } = require("playwright");
  check("Playwright", true, "Installed");
} catch (err) {
  check("Playwright", false, "Not installed or not functional");
}

// Summary
console.log("\n" + "=".repeat(60));
const passed = checks.filter((c) => c.passed).length;
const total = checks.length;
const allPassed = passed === total;

console.log(`Summary: ${passed}/${total} checks passed`);

if (allPassed) {
  console.log("✓ Environment is ready for v4 system!");
  process.exit(0);
} else {
  console.log("✗ Some checks failed. Please review the issues above.");
  process.exit(1);
}
