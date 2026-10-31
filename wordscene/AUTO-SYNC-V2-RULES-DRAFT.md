# Черновик Firestore Rules для WordScene v2

Этот фрагмент **не применён**. Перед использованием нужно встроить его в действующие правила проекта `family-school-grades`, проверить их целиком и прогнать Firebase Emulator Suite. Не заменяйте им корневой файл правил: в проекте есть другие приложения.

Внутри действующего `match /databases/{database}/documents`:

```javascript
match /users/{uid}/wordsceneEvents/{eventId} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow create: if request.auth != null
    && request.auth.uid == uid
    && request.resource.data.keys().hasAll([
      'schemaVersion', 'eventId', 'uid', 'baselineId', 'deviceId', 'wordId',
      'kind', 'payload', 'createdAt', 'receivedAt'
    ])
    && request.resource.data.keys().hasOnly([
      'schemaVersion', 'eventId', 'uid', 'baselineId', 'deviceId', 'wordId',
      'kind', 'payload', 'createdAt', 'receivedAt'
    ])
    && request.resource.data.schemaVersion == 2
    && request.resource.data.uid == uid
    && request.resource.data.eventId == eventId
    && request.resource.data.receivedAt == request.time;
  allow update, delete: if false;
}
```

Правило запрещает клиенту менять и удалять уже принятые события. Оно проверяет владельца и обязательную форму документа, но не задаёт строгую схему `payload`; перед включением нужен аудит совокупных правил и проверка лимитов/типов в эмуляторе. Текущие рабочие правила этим изменением не читаются и не меняются.
