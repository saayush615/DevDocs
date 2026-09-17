# 1. React Re-render, Remount & Dependencies — Quick Note

## 1a. Re-render vs Remount

* **Re-render:** Component function runs again. Existing state is **preserved**.
* **Remount:** Old component is destroyed and a new one is created. State **resets**.
* **State change → re-render**
* **Prop change → usually re-render**
* **Removed/re-added component or changed `key` → remount**

```text
setState() → Re-render → state preserved

Remount → old component destroyed → new component → state reset
```

---

## 1b. React Dependency Rule

> **If an `useEffect` uses a value/function from outside the effect, include it in the dependency array.**

```tsx
useEffect(() => {
  refresh();
}, [refresh]);
```

This means:

> Run the effect on mount, and again if `refresh` changes.

---

## 1c. `useCallback`

> **`useCallback` preserves the function reference between re-renders until its dependencies change.**

```tsx
const refresh = useCallback(() => {
  // ...
}, []);
```

With `[]`:

```text
Render 1 → refresh = Function A
Render 2 → refresh = Function A
Render 3 → refresh = Function A
```

So:

```tsx
useEffect(() => {
  refresh();
}, [refresh]);
```

doesn't run again just because the component re-rendered.

### ⭐ Remember

**Re-render ≠ Remount**

**`useCallback` → stable function reference**

**`useEffect` dependency → rerun when dependency changes**

## 1d. State Change & Function Creation vs Execution

* **State change → component function runs again (re-render).**
* Functions declared inside the component may be **created again** on every render.
* **Creating a function does NOT execute it.**

```tsx
function handleNewChat() {
  setCreating(true);
}
```

After a re-render:

```text
Render 1 → handleNewChat = Function A
      ↓
setCreating(true)
      ↓
Re-render
      ↓
Render 2 → handleNewChat = Function B
```

But **Function B doesn't run automatically**.

It only runs when something calls it:

```tsx
onClick={handleNewChat}
```

### ⭐ Most important distinction

```text
Function creation ≠ Function execution

Re-render
   ↓
functions may be recreated
   ↓
BUT they don't automatically execute
   ↓
They execute only when called
```

So `setCreating(true)` → re-render **does NOT** cause `handleNewChat()` to run again.

---