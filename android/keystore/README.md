# 🔑 Перманентный ключ подписи Construction APK

Этот ключ — **единственный** ключ, которым подписываются все сборки
`com.construction.app`. НЕ заменять, НЕ пересоздавать, НЕ удалять из репозитория.

## Почему это критично

Android разрешает обновлять приложение **только если новая версия подписана
тем же сертификатом**, что и установленная. Если ключ поменяется —
пользователи не смогут обновить приложение поверх установленного
(придётся удалять и ставить заново).

> ⚠️ **Агентам:** при любой сборке APK (CI, локально, вручную) подпись
> выполняется **только** этим файлом. Не генерируйте новые keystore'ы,
> не используйте `debug.keystore` от AGP и не меняйте пароль.

## Параметры ключа

| Параметр | Значение |
|---|---|
| Файл | `android/keystore/construction-release.p12` (PKCS#12) |
| Alias | `construction` |
| Пароль хранилища и ключа | `construction-key-2026` |
| Алгоритм | RSA 2048, SHA-256 |
| Подпись | `CN=Construction App, O=Construction, L=Minsk, ST=Minsk, C=BY` |
| Выдан | 2026-09-20 |
| Действителен до | **2054-02-05** (10000 дней) |

Помимо `.p12` рядом лежат исходные PEM (сертификат и приватный ключ) —
резервная копия того же ключа.

## Как Gradle использует ключ

См. `android/app/build.gradle` → блок `signingConfigs.permanent`:

```groovy
signingConfigs {
    permanent {
        storeFile rootProject.file('keystore/construction-release.p12')
        storeType 'pkcs12'
        storePassword 'construction-key-2026'
        keyAlias 'construction'
        keyPassword 'construction-key-2026'
    }
}
// и у release, и у debug: signingConfig signingConfigs.permanent
```

`build.gradle` читает ключ прямо из репозитория — **секреты GitHub не нужны**.
Переопределить (если когда-нибудь перенесут ключ) можно флагами:
`-PsignStoreFile=... -PsignStorePass=... -PsignKeyAlias=... -PsignKeyPass=...`
или env `CONSTRUCTION_KEY_FILE/PASS/ALIAS`.

## Проверка ключа (openssl)

```bash
openssl pkcs12 -info -in android/keystore/construction-release.p12 \
  -passin pass:construction-key-2026 -nokeys | head
```

## Проверка подписи собранного APK

```bash
# apksigner (Android build-tools):
apksigner verify --print-certs construction-v1.0.X.apk
# или keytool:
keytool -printcert -jarfile construction-v1.0.X.apk
# Отпечаток должен совпадать с этим (SHA-256):
```

SHA-256 отпечаток сертификата (должен совпадать; хранится и в `cert-sha256.txt`):
```
D0:E2:78:71:69:70:38:CF:2F:CC:EC:E4:2E:F7:4C:F4:B7:24:92:6D:66:20:78:2E:98:CC:AE:C4:B7:0A:3E:4A
```

## versionCode

Чтобы обновление ставилось «поверх», `versionCode` должен расти. CI передаёт
`-PciVersionCode=${{ github.run_number }}`, поэтому с каждой сборкой номер
растёт автоматически. При локальной сборке: `./gradlew assembleRelease -PciVersionCode=NNN`.

## Если ключ всё-таки потерялся/утёк (критический инцидент)

1. Собрать НОВЫЙ ключ той же схемы (RSA-2048, 10000 дней).
2. В `build.gradle` сменить путь/пароль.
3. Поставить `versionCode` больше, чем у последней опубликованной версии.
4. **Рассказать пользователям: старую версию нужно удалить и поставить новую**
   (обновление поверх старого ключа невозможно по правилам Android).
