import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { BackButtonService } from './shared/back-button.service';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'ranjha-internet';

  constructor(private backButton: BackButtonService) {}

  ngOnInit() {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('ranjha-theme', 'light');
    // Android back button: close sheets, then go back, instead of exiting.
    this.backButton.init();
  }
}
