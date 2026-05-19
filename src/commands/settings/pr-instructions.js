import { fetchApi } from '../../utils/fetchApi.js';

export async function runPrInstructionsGet({ instructionsType } = {}) {
  return fetchApi('/extension/config/pullrequest/instructions/get', 'POST', {
    instructions_type: instructionsType,
  });
}

export async function runPrInstructionsSave({ instructionType, filePattern, description, descriptionFile, instructionId } = {}) {
  return fetchApi('/extension/config/pullrequest/instructions/save', 'POST', {
    instruction_type: instructionType,
    file_pattern: filePattern,
    description,
    description_file: descriptionFile,
    instruction_id: instructionId,
  });
}

export async function runPrInstructionsEdit({ instructionType, instructionId, description, descriptionFile, filePattern } = {}) {
  if (!instructionId) {
    const err = new Error('--instruction-id is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/config/pullrequest/instructions/edit', 'POST', {
    instruction_type: instructionType,
    instruction_id: instructionId,
    description,
    description_file: descriptionFile,
    file_pattern: filePattern,
  });
}

export async function runPrInstructionsDelete({ instructionType, instructionId } = {}) {
  if (!instructionId) {
    const err = new Error('--instruction-id is required');
    err.exitCode = 1;
    throw err;
  }
  return fetchApi('/extension/config/pullrequest/instructions/delete', 'POST', {
    instruction_type: instructionType,
    instruction_id: instructionId,
  });
}
