# Rules

- Do not use `as any`, `as unknown`, `@ts-ignore` unless you have exhausted your last effort

- If your modification makes $project_root/README.md, keep it updated

- Ideally each source file shouldn't exceed 600 lines of code, and must not exceed 800 lines of code. If you find a source file exceeds 800 loc, you should split it into submodules. config files are exceptions

# Code Styles

## TypeScript

prefers

```
if (condition) {
  return
}
```

instead of

```
if (condition) return
```
