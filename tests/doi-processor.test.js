/**
 * Basic tests for DOI processing functionality.
 * Run with: node tests/doi-processor.test.js
 */
import { extractDoi, mapClassificationToBadge } from '../src/doi-processor.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
  console.log(`✅ ${message}`);
}

function testDoiExtraction() {
  console.log('\n🧪 Testing DOI extraction...');

  // Test cases for DOI extraction
  const testCases = [
    {
      text: 'Check out this paper: https://doi.org/10.1038/nature12373',
      expected: '10.1038/nature12373',
      description: 'Full HTTPS DOI URL',
    },
    {
      text: 'Found at dx.doi.org/10.1126/science.1234567',
      expected: '10.1126/science.1234567',
      description: 'DX DOI URL without HTTPS',
    },
    {
      text: 'Direct DOI: 10.1016/j.cell.2020.01.001',
      expected: '10.1016/j.cell.2020.01.001',
      description: 'Direct DOI format',
    },
    {
      text: 'No DOI in this text at all',
      expected: null,
      description: 'No DOI present',
    },
    {
      text: 'Multiple DOIs: 10.1038/nature12373 and 10.1126/science.1234567',
      expected: '10.1038/nature12373',
      description: 'Multiple DOIs (should return first)',
    },
    {
      text: 'DOI with complex suffix: 10.1371/journal.pone.0123456',
      expected: '10.1371/journal.pone.0123456',
      description: 'Complex DOI suffix',
    },
  ];

  testCases.forEach(({ text, expected, description }) => {
    const result = extractDoi(text);
    assert(result === expected, `${description}: expected "${expected}", got "${result}"`);
  });

  console.log('✅ All DOI extraction tests passed!');
}

function testClassificationMapping() {
  console.log('\n🧪 Testing classification mapping...');

  const mappingCases = [
    {
      classification: 'Paradigm Shift',
      expected: 'paradigm-shift',
      description: 'Paradigm Shift mapping',
    },
    {
      classification: 'Model Revolution',
      expected: 'model-revolution',
      description: 'Model Revolution mapping',
    },
    {
      classification: 'Normal Science',
      expected: 'normal-science',
      description: 'Normal Science mapping',
    },
    {
      classification: 'Model Crisis',
      expected: 'model-crisis',
      description: 'Model Crisis mapping',
    },
    {
      classification: 'Model Drift',
      expected: 'model-drift',
      description: 'Model Drift mapping',
    },
    {
      classification: 'Unknown Classification',
      expected: null,
      description: 'Unknown classification should return null',
    },
  ];

  mappingCases.forEach(({ classification, expected, description }) => {
    const result = mapClassificationToBadge(classification);
    assert(result === expected, `${description}: expected "${expected}", got "${result}"`);
  });

  console.log('✅ All classification mapping tests passed!');
}

async function runTests() {
  console.log('🚀 Running DOI Processor Tests');
  console.log('================================');

  try {
    testDoiExtraction();
    testClassificationMapping();

    console.log('\n🎉 All tests passed successfully!');
    console.log('\nNext steps:');
    console.log('1. Copy .env.example to .env and fill in your credentials');
    console.log('2. Run: bunx @skyware/labeler setup');
    console.log('3. Run: bun run set-labels');
    console.log('4. Run: bun run dev');
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
