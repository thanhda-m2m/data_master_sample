import {describe, expect, it} from 'vitest';
import {ResponseParser} from '../response-parser';

describe('ResponseParser', () => {
    describe('parse', () => {
        it('extracts user message before first marker', () => {
            const output = `Hello, how can I help?

---PHASE:phase_1---
---JSON---
{"field_name": "email"}
---`;

            const result = ResponseParser.parse(output);
            expect(result.userMessage).toBe('Hello, how can I help?');
        });

        it('extracts phase marker', () => {
            const output = `Some text
---PHASE:phase_1---`;

            const result = ResponseParser.parse(output);
            expect(result.phase).toBe('phase_1');
        });

        it('extracts phase_2 marker', () => {
            const output = `Some text
---PHASE:phase_2---`;

            const result = ResponseParser.parse(output);
            expect(result.phase).toBe('phase_2');
        });

        it('extracts evaluation section', () => {
            const output = `Validation result
---EVALUATION---
field is invalid
---`;

            const result = ResponseParser.parse(output);
            expect(result.evaluation).toBe('field is invalid');
        });

        it('extracts and parses JSON', () => {
            const output = `Some text
---JSON---
{"field_name": "email", "field_value": "test@example.com"}
---`;

            const result = ResponseParser.parse(output);
            expect(result.jsonData).toEqual({
                field_name: 'email',
                field_value: 'test@example.com'
            });
        });

        it('handles missing markers gracefully', () => {
            const output = 'Just plain text with no markers';

            const result = ResponseParser.parse(output);
            expect(result.userMessage).toBe('Just plain text with no markers');
            expect(result.phase).toBeUndefined();
            expect(result.jsonData).toBeUndefined();
            expect(result.evaluation).toBeUndefined();
        });

        it('handles malformed JSON gracefully', () => {
            const output = `Some text
---JSON---
{invalid json}
---`;

            const result = ResponseParser.parse(output);
            expect(result.userMessage).toBe('Some text');
            expect(result.jsonData).toBeUndefined();
        });

        it('extracts all markers in complete output', () => {
            const output = `Great! I recorded your email.

---PHASE:phase_1---
---EVALUATION---
Email format is valid
---
---JSON---
{"field_id": "f1", "field_name": "email", "field_value": "test@example.com"}
---`;

            const result = ResponseParser.parse(output);
            expect(result.userMessage).toBe('Great! I recorded your email.');
            expect(result.phase).toBe('phase_1');
            expect(result.evaluation).toContain('Email format is valid');
            expect(result.jsonData).toEqual({
                field_id: 'f1',
                field_name: 'email',
                field_value: 'test@example.com'
            });
        });

        it('handles empty string input', () => {
            const result = ResponseParser.parse('');
            expect(result.userMessage).toBe('');
            expect(result.phase).toBeUndefined();
        });

        it('handles multiple JSON blocks (takes first)', () => {
            const output = `Text
---JSON---
{"first": true}
---
---JSON---
{"second": true}
---`;

            const result = ResponseParser.parse(output);
            expect(result.jsonData).toEqual({first: true});
        });
    });
});
