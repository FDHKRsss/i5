# Patterns

_Reusable techniques that worked, so they are reused not rediscovered._

- Pin the *actual runtime defaults* in tests (server `PORT` default, `Dockerfile` `EXPOSE`, compose healthcheck URL, Vite proxy target), not just the docs — otherwise code↔docs port/config drift goes undetected.
