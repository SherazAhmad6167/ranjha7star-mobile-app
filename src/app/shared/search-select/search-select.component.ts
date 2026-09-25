import {
  Component,
  Input,
  Output,
  EventEmitter,
  forwardRef,
  HostListener,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-search-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-select.component.html',
  styleUrl: './search-select.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchSelectComponent),
      multi: true,
    },
  ],
})
export class SearchSelectComponent implements ControlValueAccessor {
  @Input() options: any[] = [];
  @Input() valueKey = '';
  @Input() displayKey = '';
  @Input() placeholder = 'Select...';
  @Input() emptyLabel = 'All';
  @Input() allowEmpty = true;
  @Input() emptyValue: any = '';
  @Input() isInvalid = false;
  /** Off for technical values (router profiles) that must read verbatim. */
  @Input() titleCase = true;
  @Output() selectionChange = new EventEmitter<any>();

  @ViewChild('searchInput') searchInput!: ElementRef;

  isOpen = false;
  searchText = '';
  selectedValue: any = '';
  disabled = false;
  panelStyle: Record<string, string> = {};

  private onChange: (val: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private el: ElementRef) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.el.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  @HostListener('window:scroll', ['$event'])
  @HostListener('window:resize')
  onScrollOrResize(): void {
    if (this.isOpen) {
      this.updatePanelPosition();
    }
  }

  get displayValue(): string {
    if (this.selectedValue === this.emptyValue || this.selectedValue == null) return '';
    if (!this.valueKey) return this.toTitleCase(String(this.selectedValue));
    const found = this.options.find((o) => o[this.valueKey] === this.selectedValue);
    return found
      ? this.toTitleCase(found[this.displayKey || this.valueKey])
      : this.toTitleCase(String(this.selectedValue));
  }

  get filteredOptions(): any[] {
    if (!this.searchText.trim()) return this.options;
    const term = this.searchText.toLowerCase();
    return this.options.filter((o) =>
      (this.displayKey ? String(o[this.displayKey]) : String(o)).toLowerCase().includes(term)
    );
  }

  getValue(opt: any): any {
    return this.valueKey ? opt[this.valueKey] : opt;
  }

  getDisplay(opt: any): string {
    return this.toTitleCase(this.displayKey ? String(opt[this.displayKey]) : String(opt));
  }

  isSelected(opt: any): boolean {
    return this.getValue(opt) === this.selectedValue;
  }

  toTitleCase(s: string): string {
    const text = String(s || '');
    if (!this.titleCase) return text;
    return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private updatePanelPosition(): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const panelH = Math.min(280, this.options.length * 38 + 60);
    const openUp = spaceBelow < panelH && rect.top > panelH;

    this.panelStyle = {
      position: 'fixed',
      left: rect.left + 'px',
      width: rect.width + 'px',
      zIndex: '9999',
      top: openUp ? (rect.top - panelH - 4) + 'px' : (rect.bottom + 4) + 'px',
    };
  }

  toggle(): void {
    if (this.disabled) return;
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.searchText = '';
      this.updatePanelPosition();
      setTimeout(() => this.searchInput?.nativeElement?.focus(), 60);
    } else {
      this.onTouched();
    }
  }

  select(opt: any | null): void {
    const val = opt !== null ? this.getValue(opt) : this.emptyValue;
    this.selectedValue = val;
    this.onChange(val);
    this.onTouched();
    this.selectionChange.emit(val);
    this.isOpen = false;
    this.searchText = '';
  }

  writeValue(val: any): void {
    this.selectedValue = val ?? '';
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
