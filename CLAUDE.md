# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatNeo is a multi-provider AI chat client built with Tauri 2, React 19, and TypeScript. The goal is to create a lightweight, native-feeling application that minimizes third-party UI dependencies.

## Architecture

**Frontend (src/):**
- React 19 with TypeScript
- Tailwind CSS v4 for styling (configured inline in `src/index.css`)
- No path aliases configured

**Backend (src-tauri/):**
- Rust with Tauri 2 framework
- Entry point: `src-tauri/src/lib.rs` (library crate)
- Commands defined with `#[tauri::command]` and registered via `invoke_handler`
- Frontend calls Rust commands using `invoke()` from `@tauri-apps/api/core`

## Development Commands

```bash
# Start development (runs both Vite and Tauri)
pnpm tauri dev

# Build for production
pnpm tauri build

# Run Vite dev server only (no Tauri)
pnpm dev

# Type-check and build frontend
pnpm build
```

## Key Configuration

- Vite dev server: port 1420 (strict)
- HMR: port 1421
- TypeScript strict mode enabled
- Package manager: pnpm

## Testing

- Run `pnpm test` after every code change (new feature, bug fix, refactor) to catch regressions.
- When adding or modifying functionality in `src/lib/`, add or update corresponding tests in `src/lib/__tests__/`.
- Test framework: Vitest (configured in `vite.config.ts`).
- Use `pnpm test:watch` during development for continuous feedback.

## Coding Standards

- Write elegant, minimal code following best practices
- Avoid verbose implementations - only write code that directly contributes to the solution
- Prioritize code quality and simplicity over unnecessary abstractions

## UI Language

All user-facing text is in Chinese (简体中文).
