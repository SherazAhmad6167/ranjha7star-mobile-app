import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { UserDocsComponent } from "./user-docs/user-docs.component";

@Component({
  selector: 'app-docs',
  imports: [CommonModule, UserDocsComponent],
  templateUrl: './docs.component.html',
  styleUrl: './docs.component.scss'
})
export class DocsComponent {
  isLoading = false;

}
