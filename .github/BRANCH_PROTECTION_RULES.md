# 🔒 Branch Protection Rules - MANDATORY SETUP

## 🚨 KRITISCHE SICHERHEIT: Diese Regeln MÜSSEN in GitHub eingerichtet werden!

### Branch: `main`
**Status: REQUIRED** - Diese Regeln verhindern E-Mail-Leaks durch Online-KI-Agenten!

#### ✅ Aktivieren:
- [ ] **Require a pull request before merging**
- [ ] **Require approvals: 1** (mindestens)
- [ ] **Dismiss stale PR approvals when new commits are pushed**
- [ ] **Require status checks to pass before merging**
  - Status check: `🔒 Email Protection Check`
- [ ] **Require branches to be up to date before merging**
- [ ] **Restrict pushes that create files that are larger than 100 MB**

#### 🚫 Verhindern:
- [ ] **Allow force pushes** - DEAKTIVIERT
- [ ] **Allow deletions** - DEAKTIVIERT

### Branch: `develop`
**Status: REQUIRED** - Gleiche Regeln wie main

### Branch: Alle anderen Branches
**Status: RECOMMENDED** - Gleiche Regeln anwenden

## 🔧 Einrichtung in GitHub:

1. Gehe zu **Settings** → **Branches**
2. Klicke **Add rule** oder bearbeite bestehende Regeln
3. Gib den Branch-Namen ein (z.B. `main`)
4. Aktiviere alle oben genannten Optionen
5. Speichere die Regel

## ⚠️ WARNUNG:
**Ohne diese Regeln können Online-KI-Agenten direkt auf main pushen und E-Mail-Adressen veröffentlichen!**

## 🎯 Warum diese Regeln wichtig sind:

1. **Pull Request Requirement**: Verhindert direkte Pushes auf geschützte Branches
2. **Status Checks**: Die Email Protection Action läuft VOR dem Merge
3. **Approvals**: Mindestens ein menschlicher Reviewer muss zustimmen
4. **Up-to-date Requirement**: Verhindert Merge-Konflikte und unerwartete Änderungen

## 🚀 Nach der Einrichtung:

- Alle Änderungen müssen durch Pull Requests gehen
- Die Email Protection Action läuft automatisch
- Private E-Mail-Adressen werden blockiert
- Repository ist sicher vor Online-KI-Agenten
