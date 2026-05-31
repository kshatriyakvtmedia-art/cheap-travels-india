# Cheap Travels India

A premium, luxury travel portal designed for **Cheap Travels India**, a travel agency based in Varanasi offering affordable luxury tours, premium cab services, and bespoke travel experiences.

## Overview
This project is a high-end, single-page responsive web application built entirely with Vanilla HTML, CSS, and JavaScript. It features dynamic scroll animations, a bespoke interactive design system, and custom functional components like an interactive quiz and a sticky scroll-based SVG drawing animation.

## Key Features
- **Luxury Aesthetic**: Custom color palettes (Gold, Teal, Dark Green) with high-end typography (`Cormorant Garamond`, `Cinzel`, `Poppins`, `EB Garamond`).
- **Interactive Custom Cursor**: A dual-ring bespoke cursor that morphs, scales, and interacts seamlessly with clickable elements on the page.
- **Dynamic Preloader**: A custom 3.5-second intro sequence featuring a fading logo, loading bar, and cinematic animations that ensure the page is ready before revealing.
- **Scroll-Scrubbed SVG Blueprint Animation**: A `150vh` sticky section where an intricate SVG car blueprint draws itself and physically drives into view as the user scrolls, finishing with a beautiful text reveal.
- **Interactive Quiz Engine**: A custom JavaScript-powered trivia quiz covering Varanasi, Ayodhya, and Prayagraj, complete with instant visual feedback and historical facts.
- **Responsive Navigation**: A glassmorphism navigation bar that adapts to scroll state and gracefully transforms into a full-screen cinematic overlay menu on mobile devices.

## File Structure
- `CheapTravelsIndia.html`: The core application file containing all the structure (HTML), styling (CSS), and logic (JS). No external dependencies required other than Google Fonts and FontAwesome.
- `CheapTravelsIndia.backup.html`: A safe fallback version of the code.

## How to Run
Simply open `CheapTravelsIndia.html` in any modern web browser. No build steps, bundlers, or local servers are required.

## Technology Stack
- **Structure**: HTML5
- **Styling**: CSS3 (Vanilla)
  - CSS Variables for Theming
  - CSS Keyframes & Transitions
  - Flexbox & CSS Grid Layouts
- **Logic**: ES6 JavaScript (Vanilla)
  - `IntersectionObserver` for performance-friendly scroll-triggered events.
  - Advanced Scroll Math calculation algorithms for scroll-scrubbed element transformations.
  - DOM Manipulation for quiz state and tab switching.
