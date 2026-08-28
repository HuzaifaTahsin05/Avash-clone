# AVASH Frontend

## Gist

`apps/web` is the client-rendered React/Vite application for **AVASH (আভাস)**, an early-warning and prevention platform for dengue in Bangladesh.

The frontend provides public health information, dengue risk analysis, weather information, prevention guidance, citizen reporting, authentication, role-aware dashboards, and the **Talk to Avash** symptom conversation.

AVASH is built as a responsive Single Page Application (SPA). Public users can access dengue-related information and awareness features, while authenticated users can access dashboard functionality according to their assigned role.

---

# Technology Overview

The AVASH frontend is built using:

* React
* Vite
* TypeScript
* React Router
* Supabase Authentication
* Plain CSS with reusable design tokens

The application is client-rendered and uses a responsive interface designed for both desktop and mobile users.

---

# Project Structure

The frontend follows a structured organization that separates shared components, pages, features, utilities, and styling.

```text
apps/web/
│
├── src/
│   │
│   ├── components/
│   │   ├── Layout
│   │   ├── Header
│   │   └── Shared error handling
│   │
│   ├── pages/
│   │   └── Route-level page composition
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── risk/
│   │   ├── weather/
│   │   ├── reports/
│   │   └── Other feature-specific functionality
│   │
│   ├── lib/
│   │   ├── apiClient.ts
│   │   └── env.ts
│   │
│   ├── router.tsx
│   │
│   └── styles/
│       └── global.css
```

## Directory Responsibilities

| Directory         | Responsibility                                                     |
| ----------------- | ------------------------------------------------------------------ |
| `src/components/` | Shared UI components and application shell                         |
| `src/pages/`      | Route-level page composition                                       |
| `src/features/`   | Feature-specific logic, forms, and functionality                   |
| `src/lib/`        | Shared utilities, API communication, and environment configuration |
| `src/styles/`     | Global styles and design tokens                                    |

---

# Running the Frontend

From the repository root:

```bash
pnpm install
pnpm --filter web dev
```

Additional commands:

```bash
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web preview
```

---

# Routing Architecture

Application routes are registered in:

```text
apps/web/src/router.tsx
```

The application uses client-side routing to provide navigation between public pages, authentication pages, dashboards, and protected administrative features.

## Route Map

| Route          | Purpose                                                                             | Access        |
| -------------- | ----------------------------------------------------------------------------------- | ------------- |
| `/`            | Bengali AVASH home, risk overview, prevention cards, and platform information       | Public        |
| `/risk`        | Chattogram district analysis, risk score, predictions, trends, and risk explanation | Public        |
| `/weather`     | Location selector, current weather, forecast, and breeding suitability              | Public        |
| `/symptoms`    | Talk to Avash symptom conversation and health guidance                              | Public        |
| `/prevention`  | Dengue prevention habits and common breeding sites                                  | Public        |
| `/news`        | Bangladesh, Global, Research, and Prevention updates                                | Public        |
| `/report`      | Citizen breeding-site reporting form                                                | Public        |
| `/login`       | Sign in and user registration                                                       | Public        |
| `/dashboard`   | Role-aware user dashboard                                                           | Authenticated |
| `/moderation`  | Report moderation queue                                                             | Protected     |
| `/admin/users` | User and role management                                                            | Protected     |

---

# Visual Design System

The AVASH visual system is primarily defined in:

```text
apps/web/src/styles/global.css
```

The design focuses on:

* Public health clarity
* Bengali-friendly communication
* Readable information
* Clear risk visualization
* Responsive layouts
* Large interactive controls
* Simple and trustworthy visual presentation

The platform uses the Bengali identity:

> **আভাস — সুরক্ষার আগাম বার্তা**

---

# Color Palette

The AVASH interface uses a calm and recognizable public-health color system.

| Color      | Hex Code  | Usage                                  |
| ---------- | --------- | -------------------------------------- |
| Deep Teal  | `#0F766E` | Primary brand and interactive elements |
| Emerald    | `#10B981` | Positive and safe states               |
| Navy       | `#0F172A` | Primary text and headings              |
| Paper      | `#F8FAFC` | Main page background                   |
| White      | `#FFFFFF` | Cards and elevated surfaces            |
| Muted Gray | `#64748B` | Secondary text                         |
| Border     | `#DBE7E5` | Borders and structural separation      |
| Amber      | `#F5B938` | Warning and moderate states            |
| Coral      | `#EF765B` | Alert and high-risk states             |

## Visual Principle

Teal represents the primary AVASH brand identity.

Colors are also used to communicate dengue risk. However, color is not the only source of information. Risk indicators should always include a clear textual label.

---

# Risk Color System

AVASH communicates risk through four primary levels.

| Risk Level | Visual Indicator |
| ---------- | ---------------- |
| Low        | Green            |
| Moderate   | Yellow           |
| High       | Orange           |
| Critical   | Red              |

Risk indicators are used in:

* Risk analysis
* District information
* Risk cards
* Dashboard summaries
* Predictions
* Reports
* Status indicators

The same risk scale should be reused throughout the application to maintain consistency.

---

# Typography

The AVASH frontend uses a Bengali-capable font stack:

```text
Nirmala UI
Noto Sans Bengali
Segoe UI
System fallbacks
```

The typography system supports both Bengali and English content.

## Typography Hierarchy

### Hero Heading

Used on the main home page.

Characteristics:

* Large responsive size
* Strong visual hierarchy
* Tight line-height
* High emphasis

### Page Heading

Used on major pages such as:

* Risk
* Weather
* Prevention
* News
* Report

### Section Heading

Used to organize major content sections.

Examples include:

* Risk Overview
* Weather Information
* Prevention Guidance
* Latest News
* Dashboard Overview

### Supporting Text

Supporting descriptions use comfortable spacing and muted colors to maintain readability without competing with primary content.

### Labels and Metadata

Smaller typography is used for:

* Dates
* Categories
* Status labels
* Form labels
* Risk labels
* Supporting information

---

# Layout System

The AVASH frontend primarily uses:

* CSS Grid
* Flexbox
* Centered content containers
* Responsive grids
* Flexible card layouts

Common layouts include:

```text
Two Columns
      ↓
Single Column on Mobile
```

and:

```text
Multiple Cards
      ↓
Fewer Columns
      ↓
Single Column
```

The layout adapts according to the available screen size.

---

# Responsive Design

The frontend includes responsive breakpoints around:

| Breakpoint | Purpose                         |
| ---------- | ------------------------------- |
| `900px`    | Large layout adjustments        |
| `800px`    | Dashboard and tablet adaptation |
| `700px`    | Grid restructuring              |
| `560px`    | Mobile layout adjustments       |
| `430px`    | Small mobile optimization       |

## Desktop

Desktop layouts prioritize:

* Multi-column layouts
* Wide information panels
* Dashboard sidebars
* Large visual sections
* Multi-card grids

## Tablet

Tablet layouts reduce:

* Number of columns
* Horizontal spacing
* Navigation density

## Mobile

Mobile layouts prioritize:

* Single-column content
* Comfortable touch targets
* Stacked components
* Reduced horizontal padding
* Responsive navigation
* Scrollable dense content where necessary

The primary mobile viewport for visual testing is:

```text
390 × 844
```

---

# Navigation

The AVASH navigation system includes:

* AVASH brand identity
* Navigation links
* Active route indication
* Authentication actions

The navigation remains accessible while users browse the application.

## Navigation States

Navigation links include:

* Default state
* Hover state
* Active state

The active route uses the AVASH teal color to indicate the user's current location.

On smaller screens, navigation spacing adapts to prevent layout overflow.

---

# Buttons

Buttons are designed as clear, touch-friendly interactive controls.

Common button styles include:

* Primary actions
* Secondary actions
* Outline actions
* Text actions
* Disabled states

Buttons maintain consistent:

* Typography
* Padding
* Border treatment
* Interaction states
* Responsive sizing

Primary actions generally use the AVASH brand color.

---

# Cards

Cards are one of the main reusable visual components in AVASH.

They are used for:

* Risk information
* Weather data
* Prevention guidance
* Predictions
* News
* Dashboard metrics
* Reports
* AI information

Common card characteristics include:

* Light surface
* Clear border
* Rounded corners
* Consistent padding
* Strong title hierarchy

---

# Forms

Forms are used throughout the application for:

* Authentication
* Registration
* Citizen reports
* Filters
* Administrative actions

Forms should include:

* Clear labels
* Readable input fields
* Visible boundaries
* Large touch targets
* Helpful validation feedback
* Responsive layouts

User-facing errors should remain clear and easy to understand.

---

# Tables

Tables are primarily used in administrative and moderation interfaces.

They may display:

* Reports
* Users
* Status information
* Dates
* Priorities
* Actions

Dense tables should remain usable on smaller screens through responsive layouts or horizontal overflow containers.

---

# Home Page

Route:

```text
/
```

The AVASH homepage is the main public entry point to the platform.

It combines dengue awareness, risk information, prevention guidance, and platform identity.

## Main Sections

### Hero Section

The hero introduces:

* AVASH identity
* Dengue early-warning purpose
* Public health awareness
* Primary calls to action

The desktop layout uses a prominent two-column composition.

### Risk Overview

The homepage presents dengue risk information using:

* Risk labels
* Scores
* Visual indicators
* Location-related information

### Statistics

Important platform or dengue-related information is displayed through structured statistic cards or panels.

### Prevention

Prevention cards introduce users to practical dengue prevention actions.

### Platform Information

Additional sections explain AVASH features and how the platform helps users understand dengue-related risks.

### Footer

The footer contains:

* AVASH identity
* Supporting information
* Navigation links
* Additional platform information

On mobile devices, the footer adapts into a simpler stacked layout.

---

# Risk and District Analysis

Route:

```text
/risk
```

The risk page provides district-level dengue analysis.

## Features

The interface presents:

* Chattogram district context
* Current risk score
* Risk status
* Prediction horizons
* Trend visualization
* Weather-related signals
* Risk explanations

The risk explanation helps users understand why a district may have increased dengue risk.

Factors may include:

* Humidity
* Rainfall
* Temperature
* Risk trend

Risk information is always presented using both visual and textual communication.

---

# Weather Dashboard

Route:

```text
/weather
```

The weather page presents environmental conditions relevant to dengue awareness.

## Features

* Location selector
* Temperature
* Humidity
* Rainfall
* Wind
* Pressure
* Forecast information
* Dengue breeding-suitability indicator

Weather information is organized using responsive cards and information panels.

When information is unavailable, the interface should clearly indicate that data is unavailable instead of displaying misleading values.

---

# Talk to Avash

Route:

```text
/symptoms
```

The symptom conversation interface is called:

# Talk to Avash

It provides general health and dengue-related information through a conversational interface.

## Current Features

* Assistant welcome message
* Online status
* Starter prompts
* Free-text message composer
* User messages
* Assistant responses
* Local fallback responses

Starter prompts guide users toward topics such as:

* Fever
* Dengue symptoms
* Urgent care

## Medical Disclaimer

The interface clearly communicates:

> This tool does not diagnose dengue.

Talk to Avash provides informational guidance and should not be presented as a replacement for professional medical care or emergency services.

---

# Prevention Page

Route:

```text
/prevention
```

The prevention page provides public dengue education.

## Main Topics

* Avoiding mosquito bites
* Removing standing water
* Protecting the home
* Keeping the community clean

## Common Breeding Sites

The page highlights common breeding locations such as:

* Buckets
* Plant trays
* Blocked drains
* Discarded tires

Prevention guidance is organized using reusable cards containing:

* Visual indicators
* Titles
* Descriptions
* Practical actions

---

# News Page

Route:

```text
/news
```

The news page provides dengue-related information and updates.

## Categories

* Bangladesh
* Global
* Research
* Prevention

The interface allows users to filter content by category.

News is displayed through reusable article cards containing:

* Category
* Title
* Summary
* Date or metadata
* Additional reading actions

---

# Citizen Reporting

Route:

```text
/report
```

The reporting feature allows citizens to report potential mosquito breeding sites.

## Report Form

The form supports:

* Report type
* Location
* Map pin
* Description
* Photo selection
* Submission

After submission, the user receives:

* Submission confirmation
* Report identification
* Under-review status

The reporting interface is designed to make citizen participation simple and accessible.

---

# Authentication

Route:

```text
/login
```

The authentication interface provides:

* Sign in
* User registration

## Registration Fields

* Name
* Email
* Password
* Confirm password
* Account type

The default public registration type is:

```text
User / Citizen
```

Moderator and Admin roles require authorization through protected workflows.

## Session Management

The frontend authentication system manages:

* User session
* User information
* Role information
* Authentication status

Role information controls the visible dashboard experience and available navigation options.

---

# Protected Routes

Protected routes control access to authenticated sections of the application.

They handle:

* Loading authentication state
* Redirecting unauthenticated users to login
* Preserving the originally requested page
* Displaying access-restricted states when required permissions are unavailable

Protected frontend navigation improves user experience, while sensitive operations remain protected through backend authorization.

---

# Role-Aware Dashboard

Route:

```text
/dashboard
```

AVASH uses a role-aware dashboard.

The displayed interface changes depending on the user's role.

## User Dashboard

Includes:

* Local dengue risk
* Weather information
* Risk trends
* Talk to Avash
* Citizen reports
* Latest news
* Prevention checklist

## Moderator Dashboard

Includes:

* Reports awaiting review
* Priority reports
* District activity
* Moderation actions

## Admin Dashboard

Includes:

* User management
* Moderator management
* Reports
* Dengue-related data
* Predictions
* Prediction accuracy
* AI monitoring
* Data management

---

# Dashboard Layout

The desktop dashboard uses a structured layout:

```text
Sidebar
   +
Main Dashboard Content
```

The main dashboard may include:

* Page heading
* Status information
* Risk summary
* Metric cards
* Information panels
* Tables
* Activity sections

## Mobile Dashboard

On smaller screens:

* The desktop sidebar is hidden
* Navigation becomes more compact
* Content becomes full width
* Cards stack vertically
* Data panels adapt to the viewport
* Tables remain accessible through responsive overflow

---

# Moderation

Route:

```text
/moderation
```

The moderation interface allows authorized users to review citizen reports.

The moderation queue may display:

* Report ID
* Location
* Report type
* Date
* Priority
* Status
* Available actions

Moderators can review report information before performing actions such as:

* Approve
* Reject
* Resolve

---

# User and Role Management

Route:

```text
/admin/users
```

This section supports administrative management of:

* Users
* Roles
* Privileged access

Administrative actions are available only to authorized users.

---

# API Communication

Frontend API communication is managed through:

```text
src/lib/apiClient.ts
```

The API client provides a centralized location for communication between the frontend and backend.

It is responsible for:

* Sending requests
* Receiving responses
* Handling request failures
* Managing timeout behavior
* Providing consistent error handling

Feature-specific API behavior should remain organized inside the relevant feature directory where appropriate.

---

# Environment Configuration

The frontend uses public build-time environment variables.

Frontend configuration should only contain values that are safe to expose in a browser environment.

Sensitive credentials must never be included in frontend code.

Examples of information that must remain private include:

* Service credentials
* Database secrets
* Private API keys
* AI provider keys
* Administrative secrets

---

# Accessibility

AVASH follows several important accessibility principles.

## Headings

Each route should contain one clear primary page heading.

## Interactive Controls

Interactive elements should be:

* Keyboard accessible
* Clearly identifiable
* Easy to focus
* Large enough for touch interaction

## Forms

Form fields should include:

* Visible labels
* Clear descriptions
* Accessible names where necessary

## Risk Information

Risk communication must include text labels in addition to color.

## Responsive Content

Dense information should adapt without breaking the page layout.

---

# Error and Offline States

Public pages should remain informative even when live services are unavailable.

The frontend should provide:

* Clear loading states
* Safe error states
* Generic failure messages
* Explicit unavailable-data indicators

The application should avoid displaying raw technical errors to users.

---

# Testing and Verification

Recommended frontend checks after a UI change include:

```bash
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web test:e2e
```

## Manual Verification

For visual changes, check:

### Desktop

```text
1440 × 1024
```

### Mobile

```text
390 × 844
```

Also verify:

1. Keyboard navigation
2. Focus behavior
3. Responsive layout
4. Error states
5. Offline states
6. Deep-link route loading
7. Form usability
8. Table responsiveness

---

# Frontend Development Guidelines

When extending AVASH:

## Reuse Existing Patterns

Before creating new components:

* Check existing shared components
* Reuse existing design tokens
* Follow existing layout patterns
* Reuse existing risk indicators
* Maintain consistent typography

## Avoid

* Creating inconsistent risk scales
* Introducing unrelated color systems
* Adding competing typography rules
* Hardcoding sensitive information
* Creating duplicate UI patterns unnecessarily
* Relying only on color to communicate important information

## Typography Changes

Typography changes should be made carefully within the existing global typography system to maintain consistency across all pages.

## Responsive Changes

Every major UI change should be checked on both desktop and mobile screen sizes.

---

# Known Frontend Boundaries

The current frontend has several important boundaries:

* Public pages can provide static information independently of authenticated features.
* Live or authenticated functionality depends on the required backend services.
* Browser-based role visibility is primarily used to shape the user experience.
* Sensitive operations require protected authorization.
* Talk to Avash currently provides informational conversation and fallback guidance.
* Talk to Avash is not a diagnostic tool.
* Sensitive credentials must never be exposed in the browser.

---

# Final Development Checklist

Before completing a frontend change, verify:

* [ ] Type checking passes
* [ ] Production build passes
* [ ] Relevant tests pass
* [ ] Desktop layout is checked
* [ ] Mobile layout is checked
* [ ] Keyboard navigation works
* [ ] Page headings are structured correctly
* [ ] Forms have clear labels
* [ ] Risk information includes text labels
* [ ] Error messages are user-friendly
* [ ] No sensitive information is exposed
* [ ] Existing design patterns are reused
* [ ] Typography remains consistent
* [ ] Responsive behavior is maintained

---

# Summary

AVASH is a responsive frontend platform designed to support dengue awareness, early warning, risk understanding, prevention education, citizen participation, and role-based operational workflows.

The frontend is built around four main principles:

### 1. Public Accessibility

Users should be able to easily access understandable dengue-related information through a clear and responsive interface.

### 2. Risk Clarity

Risk information should be easy to understand through clear scores, labels, explanations, and visual indicators.

### 3. Secure Boundaries

Sensitive credentials and protected operations must remain outside normal public frontend access.

### 4. Consistent User Experience

Reusable components, shared styling, responsive layouts, and consistent risk communication create a unified experience throughout the AVASH platform.

AVASH combines public health awareness with interactive technology to provide users with an accessible platform for understanding dengue risks and taking preventive action.
