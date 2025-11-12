<p align="center">
    <img alt="Watcher Logo" src="/Watcher/static/watcher-logo-resize.png" height="270" width="270">
</p>

<h1 align="center">Contributing to Watcher</h1>

<p align="center">
    <a href="https://github.com/thalesgroup-cert/Watcher/forks">
        <img src="https://img.shields.io/github/forks/thalesgroup-cert/Watcher?style=for-the-badge&logo=github" alt="Forks">
    </a>
    <a href="https://github.com/thalesgroup-cert/Watcher/issues">
        <img src="https://img.shields.io/github/issues/thalesgroup-cert/Watcher?style=for-the-badge&logo=github" alt="Issues">
    </a>
    <a href="https://github.com/thalesgroup-cert/Watcher/releases/latest">
        <img src="https://img.shields.io/github/v/release/thalesgroup-cert/Watcher?style=for-the-badge&logo=semanticrelease" alt="Latest Release">
    </a>
</p>

## Getting Started

We welcome contributions to improve **Watcher**, whether through new features, bug fixes, documentation, or optimizations.
This guide explains how to set up your development environment and submit changes via Pull Requests (PRs).

**Documentation:** https://thalesgroup-cert.github.io/Watcher/


## Issues

### Bug Reports

Include: OS, Python version, Watcher version, steps to reproduce, expected vs actual behavior, and logs.

### Feature Requests

Describe the problem being solved, proposed solution, and use cases. Open an issue for discussion before implementing.

### Security Vulnerabilities

Use GitHub Security Advisories. Do not open public issues.

## Pull Requests

### Workflow

```bash
# Create branch
git checkout -b feature/<short_feature_name>

# Make changes and commit
git commit -m "Short title" -m "Optional longer description"

# Push and open PR
git push origin feature/<short_feature_name>
```

### Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

* `feat:` New feature
* `fix:` Bug fix
* `docs:` Documentation
* `refactor:` Code refactoring
* `test:` Tests
* `chore:` Maintenance

### Pull Request Requirements

* Fill Pull Request template completely
* Link related issues with `Fixes #123`
* Pass all tests
* Follow code style
* Update documentation if needed
* Minimum 80% test coverage for new code

### Branch Naming

* `feature/` - New features
* `fix/` - Bug fixes
* `docs/` - Documentation
* `refactor/` - Code improvements

## Code Review Process

* All PRs are reviewed by project maintainers.
* Reviews may request changes for consistency, security, or clarity.
* Once approved, your PR will be merged into the `test` branch, then later into `master`.

## Best Practices

* Keep commits small and focused.
* Write clear commit messages.
* Ensure code is formatted and linted.
* Add/update tests where relevant.
* Update documentation when introducing changes.

---

Following these steps helps us keep **Watcher** reliable, maintainable, and secure.
