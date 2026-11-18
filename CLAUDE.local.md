# Preferencias locales para Snap

- Mi puerto de desarrollo es 3001 (el 3000 lo usa otro proyecto)
- Tengo una copia de producción en data/snap-prod-copy.db para pruebas manuales
- Cuando crees tests, incluye casos edge: URLs con caracteres Unicode, códigos duplicados, tokens JWT expirados
- Ejecuta siempre `npm test` después de cada cambio antes de confirmar que está listo