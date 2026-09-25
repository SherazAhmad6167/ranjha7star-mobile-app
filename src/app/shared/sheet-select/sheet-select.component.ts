import { CommonModule, TitleCasePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IonModal, IonSearchbar } from '@ionic/angular';

/**
 * Mobile counterpart of `app-search-select`: same inputs and ngModel contract,
 * but the searchable option list opens as a bottom sheet instead of a
 * dropdown, which would be too narrow inside the compact filter grids.
 * Sheet styles are global (`mk-picker*` in _mobile-patterns.scss) because the
 * inline ion-modal is teleported into <ion-app>.
 */
@Component({
  selector: 'app-sheet-select',
  standalone: true,
  imports: [CommonModule, IonModal, IonSearchbar],
  templateUrl: './sheet-select.component.html',
  styleUrl: './sheet-select.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SheetSelectComponent),
      multi: true,
    },
  ],
})
export class SheetSelectComponent implements ControlValueAccessor {
  @Input() options: any[] = [];
  @Input() valueKey = '';
  @Input() displayKey = '';
  @Input() placeholder = 'All';
  @Input() emptyLabel = 'All';
  @Input() allowEmpty = true;
  @Input() emptyValue: any = '';
  @Input() titleCase = true;
  /** Sheet heading, also used in the trigger's accessible name. */
  @Input() title = 'Select';
  /** Remix icon class shown in the sheet header. */
  @Input() icon = 'ri-list-check';
  /** `filter`: compact pill for filter grids. `field`: full-size form input. */
  @Input() variant: 'filter' | 'field' = 'filter';
  @Input() isInvalid = false;
  @Output() selectionChange = new EventEmitter<any>();

  isOpen = false;
  searchText = '';
  selectedValue: any = '';
  disabled = false;
  /** Accent of the screen the picker sits on; the sheet renders outside it. */
  theme: Record<string, string> = {};

  private readonly titleCasePipe = new TitleCasePipe();
  private onChange: (val: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private el: ElementRef<HTMLElement>) {}

  get hasValue(): boolean {
    return this.selectedValue !== this.emptyValue && this.selectedValue != null;
  }

  get displayValue(): string {
    if (!this.hasValue) return '';
    const found = this.valueKey
      ? this.options.find((o) => o[this.valueKey] === this.selectedValue)
      : undefined;
    return found ? this.getDisplay(found) : this.format(String(this.selectedValue));
  }

  get filteredOptions(): any[] {
    const term = this.searchText.trim().toLowerCase();
    if (!term) return this.options;
    return this.options.filter((o) => this.rawDisplay(o).toLowerCase().includes(term));
  }

  /** Long lists get a fixed-height sheet and a search bar. */
  get isLong(): boolean {
    return this.options.length > 6;
  }

  get ariaLabel(): string {
    return `${this.title}: ${this.displayValue || this.placeholder}`;
  }

  getValue(opt: any): any {
    return this.valueKey ? opt[this.valueKey] : opt;
  }

  getDisplay(opt: any): string {
    return this.format(this.rawDisplay(opt));
  }

  initial(opt: any): string {
    return (this.rawDisplay(opt).trim().charAt(0) || '?').toUpperCase();
  }

  isSelected(opt: any): boolean {
    return this.getValue(opt) === this.selectedValue;
  }

  trackByValue = (_: number, opt: any) => this.getValue(opt);

  open(): void {
    if (this.disabled || this.isOpen) return;
    this.searchText = '';
    this.theme = this.readTheme();
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }

  onDismiss(): void {
    this.isOpen = false;
    this.onTouched();
  }

  onSearch(event: Event): void {
    this.searchText = ((event as CustomEvent).detail?.value ?? '').toString();
  }

  select(opt: any | null): void {
    const val = opt !== null ? this.getValue(opt) : this.emptyValue;
    this.selectedValue = val;
    this.onChange(val);
    this.selectionChange.emit(val);
    this.close();
  }

  writeValue(val: any): void {
    this.selectedValue = val ?? this.emptyValue;
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

  private rawDisplay(opt: any): string {
    return String((this.displayKey ? opt?.[this.displayKey] : opt) ?? '');
  }

  private format(text: string): string {
    return this.titleCase ? this.titleCasePipe.transform(text) : text;
  }

  private readTheme(): Record<string, string> {
    const style = getComputedStyle(this.el.nativeElement);
    const theme: Record<string, string> = {};
    for (const name of ['--mk-brand', '--mk-brand-soft', '--mk-brand-grad', '--mk-brand-shadow']) {
      const value = style.getPropertyValue(name).trim();
      if (value) theme[name] = value;
    }
    return theme;
  }
}
