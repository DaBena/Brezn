#!/usr/bin/env pwsh
# 🔒 Brezn Git Protection Setup Script
# Verhindert das Committen privater E-Mail-Adressen

Write-Host "🔒 Setting up Git Protection for Brezn Project..." -ForegroundColor Green

# Git-Config für Brezn setzen (SICHERE E-Mails)
Write-Host "📧 Setting Git configuration..." -ForegroundColor Yellow
git config user.email "brezn-dev@noreply.github.com"
git config user.name "Brezn Developer"

# Überprüfen der aktuellen Git-Config
Write-Host "✅ Current Git configuration:" -ForegroundColor Green
Write-Host "   Email: $(git config user.email)" -ForegroundColor Cyan
Write-Host "   Name:  $(git config user.name)" -ForegroundColor Cyan

# Branch-Status überprüfen
Write-Host "🌿 Checking current branch..." -ForegroundColor Yellow
$currentBranch = git branch --show-current
Write-Host "   Current branch: $currentBranch" -ForegroundColor Cyan

# Warnung vor direkten Pushes auf main/develop
if ($currentBranch -eq "main" -or $currentBranch -eq "develop") {
    Write-Host "⚠️  WARNING: You are on protected branch: $currentBranch" -ForegroundColor Red
    Write-Host "   Direct pushes are BLOCKED by Branch Protection Rules!" -ForegroundColor Red
    Write-Host "   Create a feature branch instead:" -ForegroundColor Yellow
    Write-Host "   git checkout -b feature/your-feature-name" -ForegroundColor Cyan
}

# Feature Branch erstellen falls nicht auf main/develop
if ($currentBranch -eq "main" -or $currentBranch -eq "develop") {
    Write-Host "🔄 Creating feature branch for development..." -ForegroundColor Yellow
    $featureBranch = "feature/agent-development-$(Get-Date -Format 'yyyyMMdd-HHmm')"
    git checkout -b $featureBranch
    Write-Host "   Created and switched to: $featureBranch" -ForegroundColor Green
}

# Git-Status anzeigen
Write-Host "📊 Git status:" -ForegroundColor Yellow
git status --short

Write-Host "✅ Git Protection Setup Complete!" -ForegroundColor Green
Write-Host "🔒 Private emails are now protected" -ForegroundColor Green
Write-Host "🌿 Working on feature branch for safe development" -ForegroundColor Green
