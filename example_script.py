#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Example Python script for FreeShow Formatter

This script reads text from stdin, processes it, and outputs the result to stdout.
Groups language sections by their language tag.

The Rust backend sets PYTHONIOENCODING=utf-8 environment variable
before starting Python, which ensures UTF-8 encoding for stdin/stdout/stderr.
This script should work correctly with Unicode characters.
"""

import sys
import re

def process_text(text):
    """
    Process the input text by grouping language sections.
    Groups all lines with the same language tag together.
    """
    lines = text.split('\n')
    output_lines = []
    
    # Dictionary to store lines by language tag
    language_groups = {}
    current_header = None
    current_section = None
    section_lines = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped_line = line.rstrip()  # Remove trailing whitespace
        
        # Check if it's a header (like [Verse], [Chorus], etc.)
        header_match = re.match(r'^\[([^\]]+)\]$', stripped_line)
        if header_match and not re.match(r'^#\d+:', header_match.group(1)):
            # Save previous section if exists
            if current_section and section_lines:
                if current_section not in language_groups:
                    language_groups[current_section] = []
                # Remove trailing empty lines from section
                while section_lines and not section_lines[-1].strip():
                    section_lines.pop()
                if section_lines:  # Only add if there are actual content lines
                    language_groups[current_section].extend(section_lines)
                section_lines = []
            
            # Start new section
            current_header = stripped_line
            output_lines.append(current_header)
            current_section = None
            i += 1
            continue
        
        # Check if it's a language tag (like [#1:en], [#2:en], [#3:ml])
        lang_match = re.match(r'^\[#(\d+):(\w+)\]$', stripped_line)
        if lang_match:
            # Save previous section if exists
            if current_section and section_lines:
                if current_section not in language_groups:
                    language_groups[current_section] = []
                # Remove trailing empty lines from section
                while section_lines and not section_lines[-1].strip():
                    section_lines.pop()
                if section_lines:  # Only add if there are actual content lines
                    language_groups[current_section].extend(section_lines)
                section_lines = []
            
            # Start new language section
            lang_num = lang_match.group(1)
            lang_code = lang_match.group(2)
            current_section = f'[#{lang_num}:{lang_code}]'
            i += 1
            continue
        
        # If we have a current section, add the line to it (but skip empty lines that are separators)
        if current_section:
            # Skip empty lines that appear right after a language tag or right before the next tag
            # We'll handle empty lines within content differently
            section_lines.append(line)
        else:
            # Lines before any section
            if stripped_line:
                output_lines.append(line)
        
        i += 1
    
    # Save the last section
    if current_section and section_lines:
        if current_section not in language_groups:
            language_groups[current_section] = []
        # Remove trailing empty lines from section
        while section_lines and not section_lines[-1].strip():
            section_lines.pop()
        if section_lines:  # Only add if there are actual content lines
            language_groups[current_section].extend(section_lines)
    
    # Output language groups in order: [#1:en], [#2:en], [#3:ml], etc.
    # Sort by the number in the tag
    sorted_sections = sorted(language_groups.items(), 
                            key=lambda x: int(re.search(r'#(\d+):', x[0]).group(1)))
    
    for section_tag, section_lines_list in sorted_sections:
        if not section_lines_list:
            continue
            
        # Remove leading empty lines from section
        cleaned_lines = section_lines_list[:]
        while cleaned_lines and not cleaned_lines[0].strip():
            cleaned_lines = cleaned_lines[1:]
        # Remove trailing empty lines from section
        while cleaned_lines and not cleaned_lines[-1].strip():
            cleaned_lines = cleaned_lines[:-1]
        
        # Only output if there are actual content lines
        if cleaned_lines:
            output_lines.append(section_tag)
            # Add the lines from this section
            for section_line in cleaned_lines:
                output_lines.append(section_line)
    
    # Join lines and clean up
    # Remove any trailing blank lines from the output
    while output_lines and not output_lines[-1].strip():
        output_lines.pop()
    
    result = '\n'.join(output_lines)
    # Ensure we end with a single newline
    if result:
        result += '\n'
    
    return result

if __name__ == "__main__":
    try:
        # Read input from stdin
        input_text = sys.stdin.read()
        
        # Process the text
        output_text = process_text(input_text)
        
        # Write output to stdout
        sys.stdout.write(output_text)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
