Resumen de limpieza y siguientes pasos

Acciones realizadas (automáticas):
- Inventario de ramas remotas y locales (`git fetch --all --prune`).
- Eliminadas ramas locales mergeadas de `main` dentro de `backup/*`.
- Generados borradores de issues a partir de `BACKLOG.md` y `PENDIENTES_MEJORAS_Y_ARREGLOS.md` en `.github/ISSUES/` (10 archivos).
- Script de limpieza remota creado en `scripts/cleanup-remote-merged-branches.ps1` (requiere confirmación manual).
- Script con comandos `gh issue create` generado en `scripts/create_issues_from_drafts.sh` (comentado).

Ramas remotas detectadas como mergeadas (candidatas para eliminación en `origin`):
- backup/local-before-cleanup-
- backup/local-main-before-force-
- backup/main-before-cleanup-
- backup/main-before-force-

Siguientes pasos recomendados (recomendación segura):
1. Revisar los borradores en `.github/ISSUES/` y editar o dividir según convenga.
2. Si desea crear issues automáticamente, instale y autentique `gh` (GitHub CLI) y ejecute `scripts/create_issues_from_drafts.sh` (descomente las líneas deseadas).
3. Para eliminar ramas remotas mergeadas, revisar `scripts/cleanup-remote-merged-branches.ps1` y ejecutarlo en PowerShell cuando esté listo (responder `yes` para confirmar).
4. Si quiere que proceda a borrar las ramas remotas y/o crear los issues automáticamente, confirme aquí y proporcionaré los comandos que ejecutaré.

Notas de seguridad

- El borrado de ramas remotas es destructivo. El script pregunta por confirmación antes de ejecutar la eliminación.
- Las ramas locales eliminadas eran mergeadas en `main` y se borraron con `git branch -d` (operación segura porque ya estaban mergeadas).

Si confirma, puedo:
- Ejecutar `scripts/cleanup-remote-merged-branches.ps1` para eliminar las ramas remotas candidatas.
- Ejecutar `scripts/create_issues_from_drafts.sh` (descomentando y corriendo las líneas) para crear issues en GitHub (requiere `gh` autenticado).
