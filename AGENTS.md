# This is NOT the React you know

This is a **Solid** SPA, not React. Many things LOOK like React (JSX, components, props) but the runtime model is fundamentally different. Quick map:

| React | Solid |
|---|---|
| `className=` | `class=` |
| `useState` | `createSignal` (call the getter to read: `value()`) |
| `useEffect` | `createEffect` (fires on initial setup AND on reactive dep changes) |
| `useEffect(fn, [])` | `onMount(fn)` |
| `useRef` (DOM) | `let el; <div ref={el!} />` — direct assignment |
| `useRef` (mutable) | plain `let` in component body |
| Components re-render | Components run ONCE; reactive primitives update DOM in place |
| `props.children` | `props.children` (same — but watch out for one-time evaluation) |
| Spread props onto element | Solid handles attributes via spread INCONSISTENTLY for `data-*` and similar — prefer direct attribute binding |

**Key implication for design work:** because Solid components run once, you cannot put logic that should run on every render into the component body. Use `createEffect` or computed signals.

**Routing:** `@solidjs/router`. Params via `useParams<{ id: string }>()` (TypeScript needs the type arg since params are `Partial<Record<string, string>>`). Navigation via `useNavigate()`. Reactive location via `useLocation()`.

**Data:** `@tanstack/solid-query` for server state. `createQuery(() => options)` reads, `createMutation(() => options)` writes. The factory function is reactive — when signals inside change, the query refetches with new args.

**Read the relevant Solid + TanStack Query docs in `node_modules/` before writing non-trivial code.** Don't assume React patterns translate.
