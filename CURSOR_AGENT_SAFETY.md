# 🚨 CURSOR AGENT SAFETY GUIDE - Email Protection

## 🔒 ABSOLUTE PROHIBITIONS FOR ALL AGENTS:

### 🚫 NEVER DO THESE THINGS:
- **NEVER** suggest squash merges that could expose private emails
- **NEVER** recommend force pushes to main/develop branches
- **NEVER** suggest git operations that rewrite history on protected branches
- **NEVER** propose commits with real email addresses
- **NEVER** suggest merging branches with private email history

### ✅ ALWAYS DO THESE THINGS:
- **ALWAYS** suggest rebase merges to preserve commit history
- **ALWAYS** recommend creating new feature branches for changes
- **ALWAYS** use `brezn-dev@noreply.github.com` for any git operations
- **ALWAYS** suggest pull request workflows instead of direct merges

## 🎯 SAFE MERGE STRATEGIES:

### 1. **REBASE MERGE (RECOMMENDED):**
```bash
# ✅ SAFE: Rebase merge preserves history
git checkout main
git pull origin main
git checkout feature-branch
git rebase main
git checkout main
git merge feature-branch
```

### 2. **CREATE NEW BRANCH (SAFEST):**
```bash
# ✅ SAFEST: Create new clean branch
git checkout main
git checkout -b feature-branch-clean
# Make changes here
git push origin feature-branch-clean
# Create PR from clean branch
```

### 3. **INTERACTIVE REBASE (FOR CLEANUP):**
```bash
# ✅ SAFE: Clean specific commits
git rebase -i HEAD~5
# Edit commits to remove private emails
git push --force-with-lease origin feature-branch
```

## 🚫 UNSAFE OPERATIONS (NEVER SUGGEST):

### ❌ **SQUASH MERGE (DANGEROUS):**
```bash
# ❌ NEVER SUGGEST: Squash merge can expose private emails
git merge --squash feature-branch  # DANGEROUS!
```

### ❌ **FORCE PUSH TO MAIN (DESTRUCTIVE):**
```bash
# ❌ NEVER SUGGEST: Force push destroys history
git push --force origin main  # DESTRUCTIVE!
```

### ❌ **FILTER-BRANCH ON MAIN (DANGEROUS):**
```bash
# ❌ NEVER SUGGEST: Rewrites history on main
git filter-branch --msg-filter 'sed...' --force --all  # DANGEROUS!
```

## 🔧 SAFE EMAIL CLEANUP:

### **LOCAL CLEANUP ONLY:**
```bash
# ✅ SAFE: Clean local commits before pushing
git config user.email "brezn-dev@noreply.github.com"
git config user.name "Brezn Developer"

# Clean specific commit
git commit --amend -m "Clean commit message without emails"
```

### **BRANCH CLEANUP:**
```bash
# ✅ SAFE: Clean feature branch before merging
git checkout feature-branch
git rebase -i main
# Edit commits to remove private emails
git push --force-with-lease origin feature-branch
```

## 📋 SAFETY CHECKLIST:

### **Before suggesting any git operation:**
1. ✅ **Check if target branch is protected** (main, develop)
2. ✅ **Verify no private emails in commit history**
3. ✅ **Use safe merge strategies** (rebase, not squash)
4. ✅ **Recommend pull request workflow**
5. ✅ **Suggest creating new clean branches**

### **If private emails are detected:**
1. 🚨 **STOP immediately**
2. 🔒 **Suggest creating new clean branch**
3. 📝 **Recommend manual cleanup process**
4. ⚠️ **Never suggest automated cleanup on main branches**

## 🎯 RECOMMENDED WORKFLOW:

### **For any changes:**
1. **Create new feature branch** from clean main
2. **Make changes** with safe email configuration
3. **Create pull request** for review
4. **Use rebase merge** to preserve history
5. **Never squash merge** on protected branches

## 🚨 EMERGENCY PROCEDURES:

### **If private emails are accidentally committed:**
1. **DO NOT push to main/develop**
2. **Create new clean branch** immediately
3. **Contact repository administrator**
4. **Never attempt automated cleanup** on protected branches

---

## 📞 REMEMBER:
**When in doubt, ALWAYS choose the SAFER option:**
- **Rebase merge** instead of squash merge
- **New clean branch** instead of history rewriting
- **Pull request workflow** instead of direct merges
- **Manual cleanup** instead of automated tools on main branches

**Your primary goal is to PROTECT private information, not to optimize git operations!**
