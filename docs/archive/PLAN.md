# Plan: Complete Scroll Implementation for APSF Explorer

## Goal
APSF Explorer UI で、Sidebar と Main content が完全にスクロール可能な状態にする。

---

## Current Problems

**Sidebar**:
- ❌ Run list がスクロール不可
- 原因: `lg:static` で height が制限されていない

**Main Content**:
- ❌ Content area がスクロール不可
- 原因: Layout hierarchy が正確でない

---

## Root Cause Analysis

### App.tsx
```jsx
<div className="h-screen w-full overflow-hidden">
  <Dashboard />
</div>
```
✅ 正しい: Root が h-screen で fixed

### Dashboard.tsx
```jsx
<>
  <Header />
  <div className="flex h-screen flex-col overflow-hidden">
    <Sidebar />
    <main className="flex-1 overflow-auto">
```
❌ 問題:
- Fragment で wrap → Header と div が兄弟
- h-screen が Header 高さを考慮していない
- Main が overflow-auto だが、parent が height 制限がない

### Sidebar.tsx
```jsx
<aside className="fixed inset-y-0 left-0 ... lg:static">
  <div className="flex h-full flex-col overflow-hidden">
    <div className="flex-1 overflow-y-auto"> // Run list
```
❌ 問題:
- `lg:static` で height が指定されない
- h-full が親の height に依存するが、親が h-full でない

---

## Solution Design

### Correct Layout Hierarchy

```
App (h-screen overflow-hidden)
├── Dashboard (flex flex-col h-screen) ← Fix: use div not fragment
│   ├── Header (flex-shrink-0 h-auto)
│   └── Container (flex-1 overflow-hidden)
│       ├── Sidebar (flex flex-col)
│       │  ├── Header (flex-shrink-0)
│       │  ├── Filters (flex-shrink-0)
│       │  └── Run list (flex-1 overflow-y-auto) ✓ Scrollable
│       └── Main (flex flex-col flex-1 overflow-hidden)
│          ├── Tab nav (flex-shrink-0 sticky top-0)
│          └── Content (flex-1 overflow-y-auto) ✓ Scrollable
```

### Key Changes Required

#### 1. Dashboard.tsx (CRITICAL)
- Change Fragment `<>` to `<div className="flex flex-col h-screen">`
- Ensure Header is `flex-shrink-0`
- Main container: `flex-1 overflow-hidden`
- Close with `</div>` not `</>`

#### 2. Sidebar.tsx (CRITICAL)
- `lg:` prefix changes:
  - `lg:static` → `lg:relative` (enables height calculation)
  - Add: `lg:h-full lg:flex lg:flex-col`
- Remove `fixed inset-y-0` from lg breakpoint (use relative positioning)
- Inner div: Keep `flex h-full flex-col overflow-hidden`
- Run list: Already has `overflow-y-auto` ✓

#### 3. Main content (Dashboard.tsx main tag)
- Change: `overflow-auto` → `overflow-y-auto` (vertical only)
- Ensure flex hierarchy is correct

#### 4. Tab navigation (Dashboard.tsx)
- Add: `flex-shrink-0` to prevent shrinking
- Keep: `sticky top-0 z-30`

#### 5. Content wrapper (Dashboard.tsx)
- Change: `p-4 ... space-y-6` div
- Add: `flex-1 overflow-y-auto` (NOT just space-y-6)

---

## Implementation Steps

### Step 1: Dashboard.tsx Fix (Fragment → Div)
```jsx
// BEFORE
return (
  <>
    <Header />
    <div className="flex h-screen ...">
  </>
)

// AFTER
return (
  <div className="flex flex-col h-screen">
    <Header />
    <div className="flex flex-1 overflow-hidden">
    </div>
  </div>
)
```

### Step 2: Sidebar.tsx Fix (static → relative + height)
```jsx
// BEFORE
<aside className="fixed inset-y-0 ... lg:static">
  <div className="flex h-full ...">

// AFTER
<aside className="fixed inset-y-0 ... lg:relative lg:h-full lg:flex lg:flex-col">
  <div className="flex h-full ...">
```

### Step 3: Main content Fix (overflow-auto → overflow-y-auto)
```jsx
<main className="flex-1 overflow-y-auto">
  {/* Tab content wrapper */}
  <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
```

### Step 4: Tab navigation Fix (flex-shrink-0)
```jsx
<div className="sticky top-0 z-30 flex-shrink-0 border-b ...">
```

---

## Expected Outcome After Fix

✅ **Sidebar**:
- Desktop: Scrollable run list (flex-1 overflow-y-auto)
- Mobile: Fixed overlay, scrollable inside

✅ **Main Content**:
- Header: Always visible at top
- Tab nav: Sticky at top of content
- Content: Full scroll from top to LogViewer

✅ **All Breakpoints**:
- Mobile (320px): Vertical scroll
- Tablet (768px): Sidebar + main both scrollable
- Desktop (1920px): Full scroll hierarchy

---

## Acceptance Criteria

| Criterion | How to Verify |
|-----------|--------------|
| Sidebar scrolls | Scroll in DevTools, run list moves |
| Main scrolls | Scroll down, see LogViewer at bottom |
| Header fixed | Scroll, header stays at top |
| No layout breaks | No overflow outside viewport |
| Mobile works | DevTools 320px, scrolls vertically |
| Console clean | No errors, no warnings |

---

## Files to Modify

1. **src/components/Dashboard.tsx** (selectedRun both cases)
2. **src/components/Sidebar.tsx** (lg: breakpoints)
3. **src/index.css** (if custom scroll styles needed)

---

## Timeline
- Estimated: 30-45 minutes
- Build: 2 minutes
- Test: 10 minutes
- Buffer: 5 minutes

---

## Notes for Fable

- **Do NOT use additional dependencies** - only Tailwind classes
- **Preserve all component functionality** - no feature changes
- **Test on mobile** - use Chrome DevTools responsiveness
- **Check console** - ensure no TS errors or warnings
- **Build must pass** - `npm run build` should succeed

---

**Status**: Ready for Build Phase Implementation
