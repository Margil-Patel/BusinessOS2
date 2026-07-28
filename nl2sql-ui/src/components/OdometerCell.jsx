import React, { useState, useEffect, useRef } from 'react';

// Global cache to persist column values across renders & components
if (!window.__cell_value_cache) {
  window.__cell_value_cache = {};
}

const OdometerCell = ({ value, columnName, tableName, rowId }) => {
  const isNumber = !isNaN(Number(value)) && value !== '' && value !== null && typeof value !== 'boolean';
  const numValue = isNumber ? Number(value) : null;
  
  const [animationClass, setAnimationClass] = useState('');
  const [displayValue, setDisplayValue] = useState(value);
  const [isFlipping, setIsFlipping] = useState(false);

  const cacheKey = `${tableName || 'unknown'}_${rowId || 'unknown'}_${columnName}`;

  useEffect(() => {
    if (!isNumber) {
      setDisplayValue(value);
      return;
    }

    const cachedPrev = window.__cell_value_cache[cacheKey];
    
    // Update the cache with current value
    window.__cell_value_cache[cacheKey] = numValue;

    if (cachedPrev !== undefined && cachedPrev !== numValue) {
      const diff = numValue - cachedPrev;
      
      // Determine green pulse vs red shake
      if (diff > 0) {
        setAnimationClass('stock-increase');
      } else if (diff < 0) {
        setAnimationClass('stock-decrease');
      }
      
      // Animate the rolling count (odometer)
      animateOdometer(cachedPrev, numValue);
    } else {
      setDisplayValue(value);
    }
  }, [value, cacheKey]);

  const animateOdometer = (from, to) => {
    setIsFlipping(true);
    const duration = 800; // ms
    const startTime = performance.now();
    
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      
      const currentVal = Math.round(from + (to - from) * easeProgress);
      setDisplayValue(currentVal);
      
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setDisplayValue(to);
        setIsFlipping(false);
        // Clear pulse/shake animation class after transition completes
        setTimeout(() => {
          setAnimationClass('');
        }, 1200);
      }
    };
    
    requestAnimationFrame(step);
  };

  if (!isNumber) {
    return <span>{value !== undefined && value !== null ? value.toString() : ''}</span>;
  }

  // Identify stock/inventory columns to trigger flash and shake animations
  const isStockCol = ['stock', 'quantity', 'count', 'price', 'box'].some(keyword => 
    columnName.toLowerCase().includes(keyword)
  );

  const className = `odometer-digit-container ${isStockCol ? animationClass : ''} ${isFlipping ? 'flipping' : ''}`;

  return (
    <span className={className}>
      {displayValue}
    </span>
  );
};

export default OdometerCell;
