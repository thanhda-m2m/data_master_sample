import {describe, expect, it} from 'vitest';
import {PhaseDetector} from '../phase-detector';
import {FieldData} from '../types';

describe('PhaseDetector', () => {
    describe('determine', () => {
        it('returns phase_1 when some required fields are empty', () => {
            const fields: FieldData[] = [
                {
                    field_id: 'f1',
                    field_name: 'email',
                    field_value: null,
                    field_type: 'email',
                    required: true,
                    options: null,
                    evaluation_target: true
                },
                {
                    field_id: 'f2',
                    field_name: 'name',
                    field_value: 'John',
                    field_type: 'text',
                    required: true,
                    options: null,
                    evaluation_target: false
                }
            ];

            expect(PhaseDetector.determine(fields)).toBe('phase_1');
        });

        it('returns phase_1 when all required fields are empty', () => {
            const fields: FieldData[] = [
                {
                    field_id: 'f1',
                    field_name: 'email',
                    field_value: null,
                    field_type: 'email',
                    required: true,
                    options: null,
                    evaluation_target: true
                }
            ];

            expect(PhaseDetector.determine(fields)).toBe('phase_1');
        });

        it('returns phase_1 when required field has empty string', () => {
            const fields: FieldData[] = [
                {
                    field_id: 'f1',
                    field_name: 'email',
                    field_value: '',
                    field_type: 'email',
                    required: true,
                    options: null,
                    evaluation_target: true
                }
            ];

            expect(PhaseDetector.determine(fields)).toBe('phase_1');
        });

        it('returns phase_1 when required field has whitespace only', () => {
            const fields: FieldData[] = [
                {
                    field_id: 'f1',
                    field_name: 'email',
                    field_value: '   ',
                    field_type: 'email',
                    required: true,
                    options: null,
                    evaluation_target: true
                }
            ];

            expect(PhaseDetector.determine(fields)).toBe('phase_1');
        });

        it('returns phase_2 when all required fields are filled', () => {
            const fields: FieldData[] = [
                {
                    field_id: 'f1',
                    field_name: 'email',
                    field_value: 'test@example.com',
                    field_type: 'email',
                    required: true,
                    options: null,
                    evaluation_target: true
                },
                {
                    field_id: 'f2',
                    field_name: 'name',
                    field_value: 'John Doe',
                    field_type: 'text',
                    required: true,
                    options: null,
                    evaluation_target: false
                }
            ];

            expect(PhaseDetector.determine(fields)).toBe('phase_2');
        });

        it('returns phase_2 when required fields filled and optional fields empty', () => {
            const fields: FieldData[] = [
                {
                    field_id: 'f1',
                    field_name: 'email',
                    field_value: 'test@example.com',
                    field_type: 'email',
                    required: true,
                    options: null,
                    evaluation_target: true
                },
                {
                    field_id: 'f2',
                    field_name: 'phone',
                    field_value: null,
                    field_type: 'text',
                    required: false,
                    options: null,
                    evaluation_target: false
                }
            ];

            expect(PhaseDetector.determine(fields)).toBe('phase_2');
        });

        it('returns phase_2 when no fields exist', () => {
            const fields: FieldData[] = [];
            expect(PhaseDetector.determine(fields)).toBe('phase_2');
        });
    });
});
