/*
Evaluated based on functionality, user experience, the quality of the code and documentation.
A brief explanation (readme.txt) of how to run the game.
*/
window.onload = function() {
    
    var container = document.querySelector(".container");
    // Create app
    var game = new TripleFind(container);
    
    // Initialize app
    game.init();

}

// TipleFind App

class TripleFind {

    constructor(container) {
        // User specified container to deploy the app
        this._container = container;
    }
    
    init() {

        // ============================================
        // Background Setup
        // ============================================

        this.loadTemplate();
        this.setEnvironment();
        this.setupGuide();
        this.assignUIEventListeners();
        this.updateLimitDisplay();
        
    }

    // Default template

    loadTemplate() {
        this._container.innerHTML = `
            <div class="top-bar">
                <div class="info-wrapper">
                    <div id="timer" title="Remaining time"><font id="u-timer">-</font></div>
                    <div id="score">
                        <div>Score</div>
                        <div id="u-score">-</div>
                    </div>
                    <div id="restart-btn" title="Restart">&#8634</div>
                </div>
                <div id="guide-btn" title="How to play?">&#63</div>
            </div>
            <div class="board">
                <div class="card-container"></div>
            </div>
            <div class="start-cover">
                <div class="cover-content">
                    <p>Triple Find</p>
                    <span>Choose the number of cards to begin</span>
                    <span>Limited to <font id="cardLimit">-</font> cards</span>
                    <div class="cardNum-wrapper">
                        <div id="cardDec" class="numChange">-</div>
                        <div id="cardNum">6</div>
                        <div id="cardInc" class="numChange">+</div>
                    </div>
                    <div id="start-btn"><i>&#9658;</i> Start</div>
                </div>
            </div>
            <div class="bottom-bar">
                <div>Copyright &copy; 2023 Alan Fung.</div>
                <div><a class="terms" href="">Terms of Service</a></div>
            </div>
        `;
    }

    setEnvironment() {
        // ============================================
        // Scene elements
        // ============================================
        this._screen = document.querySelector(".board");
        this._cardBoard = document.querySelector(".card-container");
        this._cardNum = document.querySelector("#cardNum");
        this._cardLimit = document.querySelector("#cardLimit");

        this._numChangeBtn = document.querySelectorAll(".numChange");
        this._startBtn = document.querySelector("#start-btn");
        this._guideBtn = document.querySelector("#guide-btn");
        this._restartBtn = document.querySelector("#restart-btn");

        this._utimer = document.querySelector("#u-timer");
        this._uscore = document.querySelector("#u-score");
        this._terms = document.querySelector(".terms");

        // ============================================
        // Settings
        // ============================================

        this._startDelay = 1000;
        this._endDelay = 800;
        this._hideDelay = 800;

        // ============================================
        // Controllers (Interval / Timeout)
        // ============================================

        this._timer_controller;
        this._cover_controller;
        this._result_controller;
        this._event_controller;

        // ============================================
        // States
        // ============================================

        this._gameState = 0;            // Game state : started (1) or waiting (0)
        this._timeLimit = 0;            // Game time limit
        this._gameTime = 0;             // Game elapsed time

        // ============================================
        // Game Data
        // ============================================
        
        this._selectedCards = [];       // Latest 3 selected card {card object}        
        this._guessedCards = [];        // Flipped successful triple cards {card object}        
        this._flipHistory = [];         // Flipped cards {card object}        
        this._flipHistoryCount = [];    // Cards flip count {int}        
        this._cardSet = [];             // Game Cards {card object}        
        this._reflipCount = 0;          // Total reflip count        
        this._attempt = 0;              // Total triple flip attempt        
        this._score = 0;                // Player score

        // ============================================
        // Browser Size
        // ============================================

        this._initialBrowserSize = {
            width: window.innerWidth,
            height: window.innerHeight
        }
        this._browserSize = this._initialBrowserSize;
    }

    // ============================================
    // Utility functions
    // ============================================

    shuffle(array) {
        let currentIndex = array.length,  randomIndex;
        
        while (currentIndex != 0) {                    
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
        
            // Swap random index element with the current index element.
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        
        return array;
    }

    sizeFilter(val) {
        // Reduce deck size if the space available is less than 0.1
        if (val - Math.floor(val) < 0.1)
            return val-1;
        else
            return val;
    }

    formatTime(val) {
        let hour = Math.floor(val / 60 / 60);
        let minute = Math.floor(val / 60 % 60);
        let second = val % 60;
        let time = "";
        if (hour > 0)
            time += hour+"h ";
        if (minute > 0 || hour > 0)
            time += minute+"m ";
        if (second >= 0 || minute > 0 || hour > 0)
            time += second+"s";
        return time;
    }

    // ============================================
    // Game functions
    // ============================================

    resetGame() {
        // Update game state
        this._gameState = 0;

        // Clear board
        this._cardBoard.innerHTML = "";
        
        // Reset Environment
        this._selectedCards = [];
        this._guessedCards = [];
        this._flipHistory = [];
        this._flipHistoryCount = [];
        this._cardSet = [];
        
        this._reflipCount = 0;
        this._attempt = 0;
        this._score = 0;        
        
        this._cardBoard.style = null;
        this.updateLimitDisplay();
        
        // Stop timer
        clearInterval(this._timer_controller);
    }

    // Timer

    countDown() {
        if (this._gameTime == 0) {
            clearInterval(this._timer_controller);
            this.endGame();
            return;
        }
        this._gameTime--;
        this._utimer.innerText = this.formatTime(this._gameTime);
    }

    startTimer() {        
        this.countDown();
        this._timer_controller = setInterval(this.__countDown, 1000);
    }

    // Card Select Listener

    assignSelectListener() {
        this._cardSet.forEach((scard)=>{
            scard.addEventListener("click", this.__doSelectCard, true);
        })
    }

    removeSelectListener() {
        this._cardSet.forEach((scard)=>{
            scard.removeEventListener("click", this.__doSelectCard, true);
        })
    }

    assignSelected(card) {
        if (!card.classList.contains("card-selected")){
            card.classList.add("card-selected");
            this._selectedCards.push(card);
        }
    }

    removeSelected(card) {
        this._selectedCards.forEach((fcard) => {
            fcard.classList.remove("card-selected");
        })
    }

    // Game util

    generateRandomCards(choseNum) {
        let randSet = [];
        for (let i=1;i<=choseNum/3;i++){
            randSet.push(i);
            randSet.push(i);
            randSet.push(i);
        }

        this.shuffle(randSet);
        return randSet;
    }

    computeCurrentScore() {
        let timeRatio = this._gameTime / this._timeLimit;
        let curScore = 1000;        
        if (timeRatio < 0.5)
            curScore = 500;
        else
            curScore = this._gameTime / this._timeLimit * 1000;
        curScore = Math.round(curScore / 10) * 10;
        return curScore;
    }

    computeReflipped() {
        this._flipHistoryCount.forEach((hcard, index) => {
            if (hcard > 0)
                this._reflipCount++;
        })
    }

    // Game action

    doSelectCard(e) {
        // Filter clicked elements
        if (!e.target.classList.contains("card-front"))
            return;
        
        let card =  e.target.parentElement.parentElement;
        let choseNum = parseInt(this._cardNum.innerText);
        
        // Disable actions
        this.removeSelectListener();

        // If the no. of selected is within 3
        // Do selection
        if (this._selectedCards.length+1 <= 3)
            this.assignSelected(card);
        
        // If the no. of selected below 3
        // Skip validation and enable actions
        if (this._selectedCards.length != 3)
            return this.assignSelectListener();
        
        // Three cards are selected
        let cv1 = this._selectedCards[0].getAttribute("data-value");
        let cv2 = this._selectedCards[1].getAttribute("data-value");
        let cv3 = this._selectedCards[2].getAttribute("data-value");

        // Record attempt
        this._attempt++;

        // Validation Case 1 - Triple
        if (cv1 == cv2 && cv2 == cv3){
            // Record flipped successful triple cards
            this._guessedCards = this._guessedCards.concat(this._selectedCards);
            this._selectedCards = [];
            this.assignSelectListener();

            // Compute the score to be added according to the time
            let getScore = this.computeCurrentScore();
            this._score += getScore;
            this._uscore.innerText = this._score;

            // Record of cards clicked
            for (let i=0;i<this._selectedCards.length;i++){
                if (!this._flipHistory.includes(this._selectedCards[i]))
                    this._flipHistory.push(this._selectedCards[i]);                    
            }

            // Game finishes
            if (this._guessedCards.length == choseNum) {
                clearInterval(this._timer_controller);
                return this.endGame();
            }
        }
        // Validation Case 2 - Non Triple
        else {
            for (let i=0;i<this._selectedCards.length;i++){
                if (this._flipHistory.includes(this._selectedCards[i])) {
                    this._score = this._score - 200 > 0 ? this._score - 200 : 0;
                    this._uscore.innerText = this._score;
                    break;
                }
            }

            // Flip back selected cards
            setTimeout(async () => {
                await this.removeSelected();
                this._selectedCards = [];
                this.assignSelectListener();
            }, 800)

            // Record of cards clicked
            for (let i=0;i<this._selectedCards.length;i++){
                if (!this._flipHistory.includes(this._selectedCards[i]))
                    this._flipHistory.push(this._selectedCards[i]);            
                    let val = this._flipHistoryCount[parseInt(this._selectedCards[i].getAttribute("id").substring(1))];
                    this._flipHistoryCount[parseInt(this._selectedCards[i].getAttribute("id").substring(1))] = val == null ? 0 : val+1;
            }
        }        
    }    

    // ============================================
    // Display Toggling UI functions
    // ============================================
    
    showCover() {
        let startCover = document.querySelector(".start-cover");
        if (startCover) {
            clearTimeout(this._cover_controller);
            startCover.style.left = "0";
            startCover.style.right = "0";
            startCover.style.opacity = "1";
        };
    }

    hideCover() {
        let startCover = document.querySelector(".start-cover");
        if (startCover) {
            startCover.style.opacity = "0";
            this._cover_controller = setTimeout(() => {
                startCover.style.left = "-100%";
                startCover.style.right = "unset";
            },800)
        };
    }

    showInfoBar() {
        let scoreBoard = document.querySelector(".info-wrapper");
        scoreBoard.style.top = "0";
    }

    hideInfoBar() {
        let scoreBoard = document.querySelector(".info-wrapper");
        scoreBoard.style.top = "-100%";
    }

    showGuide() {
        let getGuide = document.querySelector(".guide-cover");
        (getGuide) && (getGuide.style.display = "block");
    }

    hideGuide() {
        let getGuide = document.querySelector(".guide-cover");
        (getGuide) && (getGuide.style.display = "none");
    }

    showResult() {
        let resultCover = document.querySelector(".result-cover");
        if (resultCover) {
            clearTimeout(this._result_controller);
            resultCover.style.left = "0";
            resultCover.style.right = "0";
            resultCover.style.opacity = "1";
        };
    }

    hideResult() {
        let resultCover = document.querySelector(".result-cover");
        if (resultCover) {
            resultCover.style.opacity = "0";
            this._result_controller = setTimeout(() => {
                resultCover.style.left = "-100%";
                resultCover.style.right = "unset";
            },800)
        };
    }

    // ============================================
    // Computational UI functions
    // ============================================

    computeScreenSize() {
        let computedStyle = getComputedStyle(this._screen);

        // Client width and height include padding
        let screenHeight = this._screen.clientHeight;
        let screenWidth = this._screen.clientWidth;

        screenHeight -= parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom);
        screenWidth -= parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight);
        return {
            height: screenHeight,
            width: screenWidth
        }
    }

    computeCardSize() {
        let boardFactory = document.createElement("div");
        boardFactory.setAttribute("class","board-factory");

        let cardFactory = document.createElement("div");
        cardFactory.setAttribute("class","card-factory");

        let card = document.createElement("div");
        card.setAttribute("class","card");
        card.setAttribute("id","defaultCard");
        cardFactory.append(card);
        
        boardFactory.append(cardFactory);
        document.body.append(boardFactory);
        
        let Acard = document.querySelector("#defaultCard");
        let computedStyle = getComputedStyle(Acard);

        // Client width and height include padding
        let AcardHeight = Acard.clientHeight;
        let AcardWidth = Acard.clientWidth;

        AcardHeight += parseFloat(computedStyle.marginTop) + parseFloat(computedStyle.marginBottom);
        AcardWidth += parseFloat(computedStyle.marginLeft) + parseFloat(computedStyle.marginRight);

        document.body.removeChild(boardFactory);
        return {
            height: AcardHeight,
            width: AcardWidth
        }
    }

    computeLimit() {
        let screenSize = this.computeScreenSize();
        let newCardSize = this.computeCardSize();
        let maxX = Math.floor(this.sizeFilter(screenSize.width / newCardSize.width));
        let maxY = Math.floor(this.sizeFilter(screenSize.height / newCardSize.height));
        return {
            maxX: maxX,
            maxY: maxY,
            cap: Math.floor(maxX * maxY / 3),
            screenSize: screenSize
        }
    }

    computeDisplay(choseNum) {
        // Preferably square shape
        let square = Math.sqrt(choseNum);
        // Compute difference between perfect square and reality
        let diff = square - Math.floor(square);

        // Compute the fittest area that allow the most no. of cards
        let maxX, maxY;        
        if (diff > 0.5) {
            maxX = maxY = Math.ceil(square);
        } else if (diff < 0.5 && diff > 0) {
            maxX = maxY = Math.floor(square);
            // Add an extra line that not full
            maxY++;
        } else {
            // Perfect square
            maxX = maxY = square;
        }
        return {
            maxX: maxX,
            maxY: maxY
        }
    }

    // ============================================
    // Scene Rendering UI functions
    // ============================================

    updateLimitDisplay() {
        // Recalculate limit
        this._limit = this.computeLimit();

        // Update the limit of cards display on Start cover
        this._cardLimit.innerText = this._limit.cap * 3;

        // First initialize case
        if (this._initialLimit == null) {
            this._initialLimit = this._limit;
            return;
        }

        // Patch the number if the number of cards exceed new limit
        if (this._cardNum.innerText > this._limit.cap * 3)
            this._cardNum.innerText = this._limit.cap * 3;
    }

    updateCardNum(e) {
        let curNum = parseInt(this._cardNum.innerText);
        let multiple = curNum/3;
        // Increase button
        if (e.target.id == "cardInc")
            curNum = multiple < this._limit.cap ? 3 * (multiple + 1) : curNum;
        // Decrease button
        else if (e.target.id == "cardDec")
            curNum = multiple > 2 ? 3 * (multiple - 1) : curNum;
        this._cardNum.innerText = curNum;
    }

    buildGameEnv() {
        // Prevent multiple click during Scene transition
        this._startBtn.removeEventListener("click", this.__buildGameEnv);

        this.hideCover();
        this.showInfoBar();

        // Lock initial size
        this._initialLimit = this._limit;
        this._initialBrowserSize = this._browserSize;

        this._gameState = 1;
        
        // The card number chose by user
        let choseNum = parseInt(this._cardNum.innerText);

        // Setup game scene
        this.startGame(choseNum);

        // Generate random cards' order
        let randSet = this.generateRandomCards(choseNum);

        // Calculate display depends on chose number
        let optimalSize = this.computeDisplay(choseNum);
        if (optimalSize.maxX > this._limit.maxX || optimalSize.maxY > this._limit.maxY )
            optimalSize = this._limit;
        
        // Cards Serialization
        for (let i = 1; i <= choseNum; i++){
            let card = document.createElement("div");
            card.setAttribute("class","card");
            card.setAttribute("id","c"+i);
            card.setAttribute("data-value", randSet[i-1]);
            
            let cardInner = document.createElement("div");
            cardInner.setAttribute("class","card-inner");

            let cardFront = document.createElement("div");
            cardFront.setAttribute("class","card-front");
            let cardBack = document.createElement("div");
            cardBack.setAttribute("class","card-back");

            let cardVal = document.createElement("div");
            cardVal.innerText = randSet[i-1];
            cardBack.append(cardVal);

            cardInner.append(cardFront);
            cardInner.append(cardBack);
            card.append(cardInner);
            this._cardBoard.append(card);

            if (i % optimalSize.maxX == 0) {
                let br = document.createElement("br");
                this._cardBoard.append(br);
            }

            card.addEventListener("click", this.__doSelectCard, true);

            this._cardSet.push(card);
        }
    }

    setupGuide() {
        let guideCover = document.createElement("div");
        guideCover.setAttribute("class", "guide-cover");
        guideCover.style.display = "none";
        guideCover.addEventListener("click", (e) => {
            if (e.target.classList.contains("guide-cover"))
                this.hideGuide();
        }, true);

        let guideContent = document.createElement("div");
        guideContent.setAttribute("class", "guide-content");

        let guideTitle = document.createElement("div");
        guideTitle.setAttribute("class", "guide-title");
        guideTitle.innerText = "How To Play?";

        let showcase = document.createElement("div");
        showcase.setAttribute("class", "guide-showcase");

        //
        let t1 = document.createElement("p");
        t1.innerText = "Find all triples within the time limit";

        //
        let t2 = document.createElement("p");
        t2.innerText = "Try to solve it as quick as you can and obtain your highest score";

        //
        let t3 = document.createElement("img");
        t3.setAttribute("src", "asset/image/triples.png");

        showcase.append(t1);
        showcase.append(t2);
        showcase.append(t3);

        let tips = document.createElement("div");
        tips.setAttribute("class", "guide-tips");

        //
        let t4 = document.createElement("p");
        t4.innerText += "Remember the cards flipped to prevent mistakes";

        //
        let t5 = document.createElement("p");
        t5.innerText += "The sooner you find a triple the higher score you get";

        //
        let t6 = document.createElement("p");
        t6.innerText += "A fail triple with reflipped cards will reduce 200 scores";

        tips.append(t4);
        tips.append(t5);
        tips.append(t6);                

        showcase.append(tips);

        guideContent.append(guideTitle);
        guideContent.append(showcase);

        guideCover.append(guideContent);
        this._container.append(guideCover);
    }

    setupResult() {
        let resultCover = document.createElement("div");
        resultCover.setAttribute("class", "result-cover");
        resultCover.style.opacity = "0";
        resultCover.style.left = "-100%";
        resultCover.style.right = "unset";
        resultCover.addEventListener("click", () => {            
            this.resetGame();
            this.hideResult();
            setTimeout(() => {
                this.restart();
            }, this._hideDelay/2);
        }, true);

        let resultContent = document.createElement("div");
        resultContent.setAttribute("class", "result-content");

        let resultTitle = document.createElement("div");
        resultTitle.setAttribute("class", "result-title");
        resultTitle.innerText = "Final Result";

        let resultDetail = document.createElement("div");
        resultDetail.setAttribute("class", "result-detail");
        
        //
        let t1 = document.createElement("p");
        t1.setAttribute("class","triplefound");        

        //
        let t2 = document.createElement("p");
        t2.setAttribute("class","attempts");        

        //
        let t3 = document.createElement("p");
        t3.setAttribute("class","totalscore");        

        //
        let t4 = document.createElement("p");
        t4.setAttribute("class","timespent");        

        //
        let t5 = document.createElement("p");
        t5.setAttribute("class","accuracy");
        
        resultDetail.append(t1);
        resultDetail.append(t2);
        resultDetail.append(t3);
        resultDetail.append(t4);
        resultDetail.append(t5);

        resultContent.append(resultTitle);
        resultContent.append(resultDetail);

        resultCover.append(resultContent);
        this._container.append(resultCover);
    }

    computeResult() {
        let gt1 = document.querySelector(".result-detail .triplefound");        
        let gt2 = document.querySelector(".result-detail .attempts");
        let gt3 = document.querySelector(".result-detail .totalscore");
        let gt4 = document.querySelector(".result-detail .timespent");
        let gt5 = document.querySelector(".result-detail .accuracy");

        //
        let completeRatio = Math.floor(this._guessedCards.length/this._cardSet.length*100*100)/100;
        gt1.innerHTML = `<span>Triple Found</span> <span>&#62;</span> <span>${this._guessedCards.length/3} / ${this._cardSet.length/3} (${completeRatio}%)</span>`;

        //
        let addS = (this._attempt > 1) ? 's</span>' : '</span>';
        gt2.innerHTML = `<span>Triple Flipped</span> <span>&#62;</span> <span>${this._attempt} time${addS}`;

        //
        gt3.innerHTML = `<span>Total Score</span> <span>&#62;</span> <span>${this._score}</span>`;

        //
        let timeSpent = this.formatTime(this._timeLimit-this._gameTime);
        gt4.innerHTML = `<span>Time Spent</span> <span>&#62;</span> <span>${timeSpent}</span>`;

        //
        this.computeReflipped();
        let successRatio = 1 -(this._reflipCount / 3) / this._attempt;
        let accuracy = this._attempt > 0 ? Math.floor(successRatio*100*100)/100 : 0;
        gt5.innerHTML = `<span>Accuracy</span> <span>&#62;</span> <span>${accuracy}%</span>`;
    }

    startGame(cardNum) {
        // Set timer
        let bestTime = Math.floor(6 * (cardNum / 3 * cardNum / 3) / 1.85)+13;
        this._timeLimit = bestTime;
        this._gameTime = bestTime;
        this._utimer.innerText = this.formatTime(this._gameTime);

        // Set score
        this._uscore.innerText = this._score;

        this._event_controller = setTimeout(() => {
            this.startTimer();
        }, this._startDelay);
    }

    endGame() {
        let getResult = document.querySelector(".result-cover");
        this.hideInfoBar();

        // Initialize Result page if not exist
        if (!getResult)
            this.setupResult();
        
        this.computeResult();

        setTimeout(() => {
            this.showResult();
        }, this._endDelay)        
    }

    restart() {
        // Reassign eventlistener for early restart
        if (this._event_controller != null) {
            clearTimeout(this._event_controller);
            this._startBtn.addEventListener("click", this.__buildGameEnv);
        }

        this.hideInfoBar();
        this.resetGame();
        this.showCover();
    }

    onResize() {
        this._browserSize = {
            width: window.innerWidth,
            height: window.innerHeight
        }

        // Resize on Start cover
        if (this._gameState == 0)
        this.updateLimitDisplay();

        // Resize in game
        if (this._gameState == 1) {
            this._limit = this.computeLimit();
            
            // Prevent squishing
            this._cardBoard.style.position = "absolute";
            // Lock board size
            this._cardBoard.style.width = this._initialLimit.screenSize.width;

            // On window scaling down
            if (this._browserSize.width < this._initialBrowserSize.width)
                this._cardBoard.style.scale = this._limit.screenSize.width / this._initialLimit.screenSize.width;
            // On window scaling up
            else
                this._cardBoard.style.scale = null;
        }
    }

    assignUIEventListeners() {

        // Scope binding

        this.__countDown = this.countDown.bind(this);
        this.__doSelectCard = this.doSelectCard.bind(this);
        this.__buildGameEnv = this.buildGameEnv.bind(this);
        this.__showGuide = this.showGuide.bind(this);
        this.__restart = this.restart.bind(this);
        this.__onResize = this.onResize.bind(this);

        // Event listeners

        this._startBtn.addEventListener("click", this.__buildGameEnv);
        this._guideBtn.addEventListener("click", this.__showGuide);
        this._restartBtn.addEventListener("click", this.__restart);
        this._terms.addEventListener("click", (e) => {e.preventDefault()})

        // Responsive display

        window.addEventListener("resize", this.__onResize);
        
        // Smooth Card number selection

        this.__to   = null;
        this.__iv   = null;

        this._numChangeBtn.forEach((btn) => {
            btn.addEventListener("mousedown", (e) => {
                this.updateCardNum(e);
                this.__to = setTimeout(() => {
                    this.__iv = setInterval(() => {
                        this.updateCardNum(e);
                    }, 75);
                }, 500);
            })
            btn.addEventListener("mouseup", () => {
                clearTimeout(this.__to);
                clearInterval(this.__iv);
            });
            btn.addEventListener("mouseleave", () => {
                clearTimeout(this.__to);
                clearInterval(this.__iv);
            });
        })
    }
}