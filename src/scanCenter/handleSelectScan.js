export function handleSelectScan({ STEPS, item, setSelectedScan, setStep }) {
  setSelectedScan(item.value);
  setStep(STEPS.SELECT_RESULT_TYPE);
}
