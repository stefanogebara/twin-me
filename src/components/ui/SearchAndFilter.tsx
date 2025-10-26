import React, { useState, useCallback, useMemo } from 'react';
import { useLoading } from '../../contexts/LoadingContext';
import { useError } from '../../contexts/ErrorContext';
import { LoadingSpinner } from './LoadingSpinner';

interface SearchAndFilterProps<T> {
  data: T[];
  onFilteredData: (filteredData: T[]) => void;
  searchKeys: (keyof T)[];
  filters?: FilterConfig<T>[];
  placeholder?: string;
  className?: string;
}

interface FilterConfig<T> {
  key: keyof T;
  label: string;
  type: 'select' | 'multiselect' | 'range' | 'boolean';
  options?: Array<{ value: string | number | boolean; label: string }>;
  min?: number;
  max?: number;
}

export function SearchAndFilter<T>({
  data,
  onFilteredData,
  searchKeys,
  filters = [],
  placeholder = 'Search...',
  className = ''
}: SearchAndFilterProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string | number | boolean | string[] | { min?: number; max?: number }>>({});
  const [showFilters, setShowFilters] = useState(false);
  const { isLoading } = useLoading();

  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(item =>
        searchKeys.some(key => {
          const value = item[key];
          return String(value).toLowerCase().includes(searchLower);
        })
      );
    }

    // Apply filters
    filters.forEach(filter => {
      const filterValue = filterValues[String(filter.key)];
      if (filterValue !== undefined && filterValue !== null && filterValue !== '') {
        result = result.filter(item => {
          const itemValue = item[filter.key];

          switch (filter.type) {
            case 'select':
              return itemValue === filterValue;
            case 'multiselect':
              return Array.isArray(filterValue) ? filterValue.includes(itemValue) : itemValue === filterValue;
            case 'boolean':
              return Boolean(itemValue) === Boolean(filterValue);
            case 'range': {
              const numValue = Number(itemValue);
              const rangeValue = filterValue as { min?: number; max?: number };
              return (
                (rangeValue.min === undefined || numValue >= rangeValue.min) &&
                (rangeValue.max === undefined || numValue <= rangeValue.max)
              );
            }
            default:
              return true;
          }
        });
      }
    });

    return result;
  }, [data, searchTerm, filterValues, searchKeys, filters]);

  React.useEffect(() => {
    onFilteredData(filteredData);
  }, [filteredData, onFilteredData]);

  const handleFilterChange = useCallback((filterKey: string, value: string | number | boolean | string[] | { min?: number; max?: number }) => {
    setFilterValues(prev => ({
      ...prev,
      [filterKey]: value
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterValues({});
  }, []);

  const renderFilter = (filter: FilterConfig<T>) => {
    const value = filterValues[String(filter.key)];

    switch (filter.type) {
      case 'select':
        return (
          <select
            key={String(filter.key)}
            value={value || ''}
            onChange={(e) => handleFilterChange(String(filter.key), e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5722] focus:border-transparent"
          >
            <option value="">All {filter.label}</option>
            {filter.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div key={String(filter.key)} className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{filter.label}</label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {filter.options?.map(option => (
                <label key={option.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Array.isArray(value) ? value.includes(option.value) : false}
                    onChange={(e) => {
                      const currentValues = Array.isArray(value) ? value : [];
                      const newValues = e.target.checked
                        ? [...currentValues, option.value]
                        : currentValues.filter(v => v !== option.value);
                      handleFilterChange(String(filter.key), newValues);
                    }}
                    className="rounded border-border text-[#FF5722] focus:ring-[#FF5722]"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        );

      case 'boolean':
        return (
          <label key={String(filter.key)} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handleFilterChange(String(filter.key), e.target.checked)}
              className="rounded border-border text-[#FF5722] focus:ring-[#FF5722]"
            />
            <span className="text-sm font-medium">{filter.label}</span>
          </label>
        );

      case 'range': {
        const rangeValue = value as { min?: number; max?: number } || {};
        return (
          <div key={String(filter.key)} className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{filter.label}</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                value={rangeValue.min || ''}
                min={filter.min}
                max={filter.max}
                onChange={(e) => handleFilterChange(String(filter.key), {
                  ...rangeValue,
                  min: e.target.value ? Number(e.target.value) : undefined
                })}
                className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5722] focus:border-transparent"
              />
              <input
                type="number"
                placeholder="Max"
                value={rangeValue.max || ''}
                min={filter.min}
                max={filter.max}
                onChange={(e) => handleFilterChange(String(filter.key), {
                  ...rangeValue,
                  max: e.target.value ? Number(e.target.value) : undefined
                })}
                className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5722] focus:border-transparent"
              />
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={placeholder}
          className="block w-full pl-10 pr-12 py-3 border border-border rounded-lg focus:ring-2 focus:ring-[#FF5722] focus:border-transparent"
        />
        {isLoading('search') && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <LoadingSpinner size="sm" />
          </div>
        )}
      </div>

      {/* Filter Controls */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-card transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
            </svg>
            Filters
            {Object.keys(filterValues).length > 0 && (
              <span className="bg-[#FF5722] text-white text-xs px-2 py-1 rounded-full">
                {Object.keys(filterValues).length}
              </span>
            )}
          </button>

          {Object.keys(filterValues).length > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm text-muted-foreground hover:text-[#FF5722] transition-colors"
            >
              Clear all
            </button>
          )}

          <div className="text-sm text-muted-foreground">
            {filteredData.length} result{filteredData.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Filter Panel */}
      {showFilters && filters.length > 0 && (
        <div className="bg-card rounded-lg p-4 space-y-4 border border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filters.map(renderFilter)}
          </div>
        </div>
      )}
    </div>
  );
}