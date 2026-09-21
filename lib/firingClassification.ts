// Firing classification based on group size in inches
export function getFirerClassification(groupSizeInches: number | null): string {
  if (groupSizeInches === null) return 'N/A';
  
  if (groupSizeInches <= 4) {
    return 'Marksman';
  } else if (groupSizeInches <= 7) {
    return 'First class firer';
  } else if (groupSizeInches <= 10) {
    return 'Standard firer';
  } else {
    return 'Requires Training';
  }
}

// Get classification with color coding
export function getClassificationWithColor(groupSizeInches: number | null): {
  classification: string;
  color: string;
  bgColor: string;
  textColor: string;
} {
  if (groupSizeInches === null) {
    return {
      classification: 'N/A',
      color: '#6b7280', // gray
      bgColor: 'bg-gray-700/50',
      textColor: 'text-gray-200',
    };
  }

  if (groupSizeInches <= 4) {
    return {
      classification: 'Marksman',
      color: '#dc2626', // red
      bgColor: 'bg-red-700/50',
      textColor: 'text-red-200',
    };
  } else if (groupSizeInches <= 7) {
    return {
      classification: 'First class firer',
      color: '#2563eb', // blue
      bgColor: 'bg-blue-700/50',
      textColor: 'text-blue-200',
    };
  } else if (groupSizeInches <= 10) {
    return {
      classification: 'Standard firer',
      color: '#16a34a', // green
      bgColor: 'bg-green-700/50',
      textColor: 'text-green-200',
    };
  } else {
    return {
      classification: 'Requires Training',
      color: '#ea580c', // orange
      bgColor: 'bg-orange-700/50',
      textColor: 'text-orange-200',
    };
  }
}
