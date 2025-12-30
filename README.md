# 🔮 React Precognition

> **Stop reacting. Start predicting.**
> A hook that speculatively executes async actions (fetches, code-splitting) when a user's cursor _intends_ to click, not just when they click.

[![npm version](https://img.shields.io/npm/v/react-precognition)](https://www.npmjs.com/package/react-precognition)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem

Standard Web: User Clicks (0ms) -> Network Request (200ms) -> UI Update. **Total Latency: 200ms.**

## The Solution

Precognition: Cursor Approach (-200ms) -> Network Request (200ms) -> User Clicks (0ms) -> UI Update. **Total Latency: 0ms.**

---

## Installation

```bash
npm install react-precognition
```
