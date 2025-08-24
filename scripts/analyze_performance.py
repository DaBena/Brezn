#!/usr/bin/env python3
"""
Performance Analysis Script for Brezn Project
Analysiert Cargo Criterion Ergebnisse und generiert HTML-Berichte
"""

import json
import sys
import os
from datetime import datetime
from typing import Dict, List, Any

def load_performance_results(file_path: str) -> Dict[str, Any]:
    """Lädt die Performance-Test-Ergebnisse aus der JSON-Datei."""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Fehler: Datei {file_path} nicht gefunden")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Fehler: Ungültige JSON-Datei {file_path}")
        sys.exit(1)

def analyze_benchmarks(data: Dict[str, Any]) -> Dict[str, Any]:
    """Analysiert die Benchmark-Ergebnisse."""
    analysis = {
        'total_benchmarks': 0,
        'fastest_benchmark': None,
        'slowest_benchmark': None,
        'average_time': 0.0,
        'regressions': 0,
        'improvements': 0,
        'benchmarks': []
    }
    
    total_time = 0.0
    min_time = float('inf')
    max_time = 0.0
    
    for benchmark in data.get('benchmarks', []):
        name = benchmark.get('name', 'Unknown')
        mean_time = benchmark.get('mean', {}).get('point_estimate', 0.0)
        
        if mean_time > 0:
            analysis['total_benchmarks'] += 1
            total_time += mean_time
            
            if mean_time < min_time:
                min_time = mean_time
                analysis['fastest_benchmark'] = name
                
            if mean_time > max_time:
                max_time = mean_time
                analysis['slowest_benchmark'] = name
            
            # Prüfe auf Regressions/Verbesserungen
            if 'regression' in benchmark:
                analysis['regressions'] += 1
            elif 'improvement' in benchmark:
                analysis['improvements'] += 1
            
            analysis['benchmarks'].append({
                'name': name,
                'mean_time': mean_time,
                'unit': benchmark.get('unit', 'ns'),
                'has_regression': 'regression' in benchmark,
                'has_improvement': 'improvement' in benchmark
            })
    
    if analysis['total_benchmarks'] > 0:
        analysis['average_time'] = total_time / analysis['total_benchmarks']
    
    return analysis

def generate_html_report(analysis: Dict[str, Any]) -> str:
    """Generiert einen HTML-Bericht aus der Analyse."""
    html = f"""
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Brezn Performance Analysis</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        h1 {{
            color: #2c3e50;
            text-align: center;
            margin-bottom: 30px;
        }}
        .summary {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .metric {{
            background: #ecf0f1;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }}
        .metric h3 {{
            margin: 0 0 10px 0;
            color: #34495e;
        }}
        .metric .value {{
            font-size: 2em;
            font-weight: bold;
            color: #2c3e50;
        }}
        .regression {{
            color: #e74c3c;
        }}
        .improvement {{
            color: #27ae60;
        }}
        .benchmarks {{
            margin-top: 30px;
        }}
        .benchmark {{
            background: #f8f9fa;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
            border-left: 4px solid #3498db;
        }}
        .benchmark.regression {{
            border-left-color: #e74c3c;
        }}
        .benchmark.improvement {{
            border-left-color: #27ae60;
        }}
        .benchmark-name {{
            font-weight: bold;
            color: #2c3e50;
        }}
        .benchmark-time {{
            color: #7f8c8d;
            font-family: monospace;
        }}
        .timestamp {{
            text-align: center;
            color: #7f8c8d;
            margin-top: 30px;
            font-size: 0.9em;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Brezn Performance Analysis</h1>
        
        <div class="summary">
            <div class="metric">
                <h3>Total Benchmarks</h3>
                <div class="value">{analysis['total_benchmarks']}</div>
            </div>
            <div class="metric">
                <h3>Average Time</h3>
                <div class="value">{analysis['average_time']:.2f}ns</div>
            </div>
            <div class="metric">
                <h3>Regressions</h3>
                <div class="value regression">{analysis['regressions']}</div>
            </div>
            <div class="metric">
                <h3>Improvements</h3>
                <div class="value improvement">{analysis['improvements']}</div>
            </div>
        </div>
        
        <div class="benchmarks">
            <h2>Benchmark Details</h2>
"""
    
    # Sortiere Benchmarks nach Zeit
    sorted_benchmarks = sorted(analysis['benchmarks'], key=lambda x: x['mean_time'])
    
    for benchmark in sorted_benchmarks:
        css_class = 'benchmark'
        if benchmark['has_regression']:
            css_class += ' regression'
        elif benchmark['has_improvement']:
            css_class += ' improvement'
        
        html += f"""
            <div class="{css_class}">
                <div class="benchmark-name">{benchmark['name']}</div>
                <div class="benchmark-time">{benchmark['mean_time']:.2f} {benchmark['unit']}</div>
            </div>
        """
    
    html += f"""
        </div>
        
        <div class="timestamp">
            Generiert am {datetime.now().strftime('%d.%m.%Y um %H:%M:%S')}
        </div>
    </div>
</body>
</html>
"""
    
    return html

def main():
    """Hauptfunktion des Skripts."""
    if len(sys.argv) != 2:
        print("Verwendung: python3 analyze_performance.py <performance-results.json>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    # Lade und analysiere die Ergebnisse
    print("📊 Lade Performance-Ergebnisse...")
    data = load_performance_results(input_file)
    
    print("🔍 Analysiere Benchmarks...")
    analysis = analyze_benchmarks(data)
    
    # Generiere HTML-Bericht
    print("📝 Generiere HTML-Bericht...")
    html_report = generate_html_report(analysis)
    
    # Speichere HTML-Bericht
    output_file = 'performance-analysis.html'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_report)
    
    print(f"✅ HTML-Bericht gespeichert: {output_file}")
    
    # Zeige Zusammenfassung
    print("\n📋 Zusammenfassung:")
    print(f"  • Total Benchmarks: {analysis['total_benchmarks']}")
    print(f"  • Durchschnittliche Zeit: {analysis['average_time']:.2f}ns")
    print(f"  • Regressions: {analysis['regressions']}")
    print(f"  • Verbesserungen: {analysis['improvements']}")
    
    if analysis['fastest_benchmark']:
        print(f"  • Schnellster Benchmark: {analysis['fastest_benchmark']}")
    
    if analysis['slowest_benchmark']:
        print(f"  • Langsamster Benchmark: {analysis['slowest_benchmark']}")

if __name__ == "__main__":
    main()