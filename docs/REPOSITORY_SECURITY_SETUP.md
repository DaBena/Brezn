# 🔒 Repository Security Setup - Administrator Guide

## 🚨 KRITISCHE SICHERHEIT: Diese Einrichtung ist OBLIGATORISCH!

### 📋 Was passiert, wenn diese Einrichtung NICHT erfolgt:
- **Online-KI-Agenten** können direkt auf main/develop pushen
- **Private E-Mail-Adressen** werden veröffentlicht
- **Datenschutzverstöße** sind unvermeidlich
- **Repository-Integrität** ist gefährdet

---

## 🎯 SCHRITT 1: Branch Protection Rules einrichten

### Für Branch `main`:
1. Gehe zu **Settings** → **Branches**
2. Klicke **Add rule** oder bearbeite bestehende Regel
3. Gib `main` als Branch name pattern ein
4. **AKTIVIERE** alle folgenden Optionen:

#### ✅ REQUIRED SETTINGS:
- [ ] **Require a pull request before merging**
- [ ] **Require approvals: 1** (mindestens)
- [ ] **Dismiss stale PR approvals when new commits are pushed**
- [ ] **Require status checks to pass before merging**
  - Status check: `🔒 Email Protection Check` (wird nach Schritt 2 verfügbar)
- [ ] **Require branches to be up to date before merging**
- [ ] **Restrict pushes that create files that are larger than 100 MB**

#### 🚫 DEAKTIVIERTE SETTINGS:
- [ ] **Allow force pushes** - DEAKTIVIERT
- [ ] **Allow deletions** - DEAKTIVIERT

### Für Branch `develop`:
- Gleiche Einstellungen wie für `main`

### Für alle anderen Branches:
- Empfohlen: Gleiche Einstellungen anwenden

---

## 🎯 SCHRITT 2: GitHub Actions aktivieren

### Überprüfung:
1. Gehe zu **Actions** Tab
2. Stelle sicher, dass Actions aktiviert sind
3. Überprüfe, ob der Workflow `🔒 Email Protection Check` läuft

### Bei Problemen:
1. Gehe zu **Settings** → **Actions** → **General**
2. Stelle sicher, dass Actions aktiviert sind
3. Überprüfe Berechtigungen für Actions

---

## 🎯 SCHRITT 3: Repository-Einstellungen

### General Settings:
1. **Settings** → **General**
2. **Features** → **Issues** aktiviert
3. **Features** → **Pull requests** aktiviert
4. **Features** → **Wikis** (optional)

### Collaborators & Teams:
1. **Settings** → **Collaborators and teams**
2. Überprüfe Berechtigungen für alle Benutzer
3. Stelle sicher, dass niemand direkten Push-Zugriff auf main/develop hat

---

## 🎯 SCHRITT 4: Webhook-Konfiguration (Optional)

### Für zusätzliche Sicherheit:
1. **Settings** → **Webhooks**
2. **Add webhook**
3. URL: (externer Service für E-Mail-Überwachung)
4. Events: **Pull requests**, **Pushes**

---

## 🔍 VERIFIKATION DER EINRICHTUNG

### Test 1: Branch Protection
```bash
# Versuche direkten Push auf main (sollte fehlschlagen)
git push origin main:main
# Erwartetes Ergebnis: ERROR - branch is protected
```

### Test 2: Pull Request Workflow
1. Erstelle Feature Branch
2. Mache Änderung
3. Erstelle Pull Request
4. Überprüfe: Email Protection Action läuft
5. Überprüfe: Merge ist blockiert ohne Approval

### Test 3: Email Protection Action
1. Erstelle PR mit privater E-Mail-Adresse
2. Überprüfe: Action blockiert den PR
3. Überprüfe: Fehlermeldung ist klar und hilfreich

---

## ⚠️ WICHTIGE HINWEISE

### 🚨 KRITISCHE REGELN:
- **NIEMALS** Branch Protection Rules deaktivieren
- **NIEMALS** direkte Pushes auf main/develop erlauben
- **NIEMALS** Email Protection Action deaktivieren
- **IMMER** Pull Request Reviews erforderlich

### 🔄 WARTUNG:
- Überprüfe wöchentlich die Action-Logs
- Überprüfe monatlich die Branch Protection Rules
- Überprüfe vierteljährlich alle Repository-Einstellungen

### 🆘 BEI PROBLEMEN:
1. Überprüfe Action-Logs auf Fehler
2. Überprüfe Branch Protection Rules
3. Überprüfe Repository-Berechtigungen
4. Kontaktiere GitHub Support bei technischen Problemen

---

## 🎯 BLOCKED EMAIL PROVIDERS

### ❌ **ALL MAJOR PROVIDERS ARE BLOCKED:**
- **International:** `gmail.com`, `yahoo.com`, `hotmail.com`, `outlook.com`, `aol.com`
- **German:** `web.de`, `gmx.com`, `t-online.de`, `freenet.de`, `arcor.de`, `1und1.de`
- **Telecom:** `vodafone.de`, `telekom.de`, `t-mobile.de`, `o2.de`, `eplus.de`
- **Apple:** `icloud.com`, `me.com`, `mac.com`
- **Privacy:** `protonmail.com`, `tutanota.de`, `posteo.de`, `mailbox.org`
- **Generic:** Any `@domain.com`, `@domain.de`, `@domain.org` patterns

### ✅ **ONLY ALLOWED:**
- `brezn-dev@noreply.github.com` (repository default)
- `user@placeholder.com` (in code examples)
- `test@example.com` (in tests)

---

## 🎉 NACH DER EINRICHTUNG

### ✅ Repository ist jetzt sicher vor:
- **Online-KI-Agenten** mit direkten Pushes
- **Private E-Mail-Adressen** in Commits
- **Unbeaufsichtigte Änderungen** auf main/develop
- **Datenschutzverstöße** durch automatisierte Tools

### 🚀 Workflow funktioniert jetzt so:
1. Alle Änderungen gehen durch Pull Requests
2. Email Protection Action läuft automatisch
3. Private E-Mail-Adressen werden blockiert
4. Menschliche Reviewer müssen zustimmen
5. Repository bleibt sicher und geschützt

---

## 📞 SUPPORT

Bei Fragen oder Problemen:
1. Überprüfe diese Dokumentation
2. Schaue in die GitHub Action Logs
3. Überprüfe die Repository-Einstellungen
4. Kontaktiere Repository-Administratoren

**🔒 Sicherheit hat höchste Priorität!**
