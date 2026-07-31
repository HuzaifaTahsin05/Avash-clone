# Frontend Coding Standards

## Scope
This document defines the frontend standards for the React + Vite SPA in this project. All frontend work should follow these rules unless a documented exception is approved.

## Core Stack
- **Framework:** React 18 + Vite
- **Routing:** React Router
- **Styling:** CSS modules or plain CSS; Tailwind is acceptable only when already adopted in a feature slice
- **State:** React Query for server state, local component state for UI-only state
- **Data access:** Use the shared API client and typed DTOs from the monorepo packages

## Architecture Rules
- Keep the app as a client-rendered SPA with no server-side rendering
- Put feature-specific UI in feature folders under the web app
- Keep presentational components small and reusable
- Prefer composition over large monolithic components
- Reuse shared UI patterns instead of duplicating layout code

## Code Quality Rules
- Use TypeScript for all new frontend code
- Prefer explicit props and clear component names
- Keep components focused on one responsibility
- Avoid inline business logic inside JSX where it becomes hard to read
- Use optional chaining for all external or untrusted data access

## Styling Rules
- Use consistent spacing, typography, and color tokens across the app
- Favor readable, accessible contrast ratios
- Keep layouts responsive for mobile and desktop
- Avoid ad-hoc styling that makes future changes difficult
- Use a calm medical-alert visual language: clean white cards, soft borders, and restrained gradients

## Visual Design System
- **Foreground / text:** `#0F172A`
- **Muted text:** `#475569`
- **Primary background:** `#F8FAFC`
- **Card background:** `#FFFFFF`
- **Primary accent:** `#0F766E`
- **Secondary accent:** `#2563EB`
- **Success:** `#16A34A`
- **Warning:** `#EAB308`
- **Danger / high risk:** `#DC2626`
- **Border / dividers:** `#E2E8F0`
- **Font family:** `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Heading scale:** `2rem` to `2.4rem` for main page titles, `1.4rem` to `1.8rem` for section headings
- **Body text:** `1rem`
- **Helper / metadata text:** `0.875rem`
- **Label / microcopy:** `0.75rem`
- **Radius:** `0.75rem` to `1rem`
- **Shadow:** soft elevation with `0 10px 30px rgba(15, 23, 42, 0.06)`

## Interaction and Motion Rules
- Use subtle motion only: fade-in, hover lift, and smooth transitions
- Prefer lightweight transitions like `transition: all 0.2s ease`
- Avoid flashy, distracting, or overly animated interfaces
- Keep interactive feedback clear and accessible

## Data Handling Rules
- Never expose secrets in the frontend bundle
- Only use public environment variables prefixed with VITE_
- Handle API loading, error, and empty states explicitly
- Treat all fetch and JSON parsing results as potentially undefined or malformed

## Accessibility Rules
- Use semantic HTML where possible
- Provide labels for form fields and interactive controls
- Ensure keyboard navigation works for links, buttons, and menus
- Avoid relying on color alone to communicate meaning

## Performance Rules
- Keep bundle size in mind for every new dependency
- Lazy-load routes or heavy feature modules when practical
- Avoid unnecessary re-renders and repeated requests

## Documentation Rule
- Any frontend change that affects behavior must be documented in the project docs and manually tested before completion
