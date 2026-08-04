# Frontend Page Build Guidance

## Purpose
This document is a documentation-only guide for how the frontend pages should be structured and what each page must communicate to users. It is intentionally isolated from runtime implementation so product and UX requirements remain explicit.

This page should be read alongside the frontend standards in [docs/standards/frontend.md](docs/standards/frontend.md) so implementation choices, page-level UX requirements, and repository-wide design expectations stay aligned.

## Core Product Pages

### 1. Risk Map Page
**Goal:** Show regional dengue outbreak risk for the next 2–4 weeks.

**Required UI behavior**
- Display an interactive map with geospatial region overlays.
- Show risk intensity using a clear legend (low, moderate, high, severe).
- Provide a quick explanation for the score, such as weather and historical patterns.
- Keep map tiles and markers lightweight and mobile-friendly.
- Use accessible labels for all map controls and legend items.

**Required supporting elements**
- A top summary card showing region name, current risk band, and confidence/updated timestamp.
- A secondary panel explaining which factors contributed to the score.

### 2. Public Reporting Portal
**Goal:** Allow citizens to report stagnant water and mosquito breeding sites.

**Required UI behavior**
- Provide a simple form for location, description, and photo evidence if available.
- Guide the user through a short, clear reporting flow.
- Show validation messages for incomplete or invalid submissions.
- Indicate the report was submitted successfully and what happens next.

**Required supporting elements**
- Map pin or location picker flow.
- Clear privacy-safe wording for citizen submissions.
- A status banner showing whether the report is pending, accepted, or routed onward.

### 3. Resource Locator Page
**Goal:** Help citizens find hospitals, blood banks, and emergency health resources.

**Required UI behavior**
- Show a searchable resource list or map-based locator.
- Surface resource availability and relevance to the user’s region.
- Keep the information structured and easy to scan.
- Support filter options where practical.

**Required supporting elements**
- Resource status labels such as open, urgent, or low stock.
- Quick-call or directions CTA patterns when appropriate.

### 4. Symptom Checker Page
**Goal:** Offer a guided symptom triage flow.

**Required UI behavior**
- Present a deterministic decision flow with clear yes/no or multiple-choice inputs.
- Avoid ambiguous medical language.
- Show a concise educational message after the result.
- Keep the interaction short and easy to complete on mobile.

**Required supporting elements**
- A clear “safe next step” message if symptoms are mild.
- A strong recommendation to seek urgent care for severe symptoms.

### 5. Weather Insights Page
**Goal:** Show meteorological context related to outbreak risk.

**Required UI behavior**
- Surface temperature, humidity, and rainfall information in a readable format.
- Tie weather values back to outbreak-risk interpretation.
- Show recent changes or current state clearly.

**Required supporting elements**
- Trend-style cards or compact indicators.
- Explanatory text for why weather matters to dengue risk.

## PWA and Offline Expectations

### Progressive Web App requirements
- The frontend should feel installable and mobile-friendly.
- The app should cache the critical experience for returning users.
- Offline support should preserve the last known useful state, especially for risk information and model assets where practical.

### UX expectation
- Users should be able to reopen the app quickly and access cached content without a fresh network request.
- UI states should clearly show whether content is live, cached, or stale.

## Frontend UX Rules for the Product Objective

### Explainable AI support
- The UI should be able to show a human-readable explanation for risk predictions.
- Risk logic should be shown as “why this score is higher/lower,” rather than as a single opaque number.

### Geospatial intelligence support
- Map interactions should prioritize clarity and discoverability.
- Users should be able to understand their current region, nearby hotspots, and the risk level without reading dense technical text.

### Public-sector utility
- The reporting flow must be simple enough for a general citizen to complete quickly.
- The interface should reduce friction for submitting a report to municipal stakeholders.

## Page Build Checklist

Before marking a page complete, confirm that it satisfies the following:
- The page communicates its purpose in one glance.
- The primary action is obvious.
- The page is readable on mobile and desktop.
- The page uses accessible labels, contrast, and keyboard-friendly interaction.
- The page clearly shows loading, error, and empty states.
- The page respects the visual design system in this repository.
